import {
  blockText,
  deleteBlock,
  insertBlock,
  moveBlock,
  replaceBlock,
  type Block,
  type Draft,
} from "./previewDraft";

const ENDPOINT = "/__body";
const IMAGE_ENDPOINT = "/__image";
const RELOAD_FALLBACK = 8000;
const REVEAL_MAX_WAIT = 500;
const HIGHLIGHT_MS = 1200;
const RELOADING_KEY = "preview-body-edit:reloading";
const RELOADING_ATTRIBUTE = "data-preview-reloading";
const FOCUS_KEY = "preview-body-edit:focus";
const STALE_KEY = "preview-body-edit:stale-body";
const RETRY_KEY = "preview-body-edit:stale-retry";
const STALE_RETRY = 3000;
const STALE_MAX_RETRY = 2;
const TOOLBAR_GAP = 4;
/** .block-toolbar の padding と一致させること */
const TOOLBAR_HIT_PADDING = 10;
const TOOLBAR_HIDE_DELAY = 400;
const VIEWPORT_MARGIN = 8;
type EditMode = "replace" | "insert-after" | "insert-before";

type ToolbarAction =
  | "edit"
  | "up"
  | "down"
  | "insert-before"
  | "insert-after"
  | "image"
  | "delete";

const TOOLBAR_BUTTONS: [ToolbarAction, string | null, string][] = [
  // 画像ブロックはクリックが Lightbox に取られるため、ここから編集する
  ["edit", "✎", "このブロックを編集"],
  ["up", "↑", "1つ上へ移動"],
  ["down", "↓", "1つ下へ移動"],
  ["insert-before", "＋↑", "上にブロックを追加"],
  ["insert-after", "＋", "下にブロックを追加"],
  ["image", null, "下に画像を追加"],
  ["delete", null, "このブロックを削除"],
];

const getMessage = (payload: unknown, fallback: string) => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return fallback;
};

const readJson = (root: ParentNode, selector: string): unknown => {
  const script = root.querySelector(selector);
  if (!script?.textContent) return null;

  try {
    return JSON.parse(script.textContent);
  } catch {
    return null;
  }
};

const readEmbeddedBody = (root: ParentNode) => {
  const parsed = readJson(root, "[data-post-body]");
  return typeof parsed === "string" ? parsed : null;
};

const readBlocks = (prose: HTMLElement): Block[] => {
  const parsed = readJson(prose, "[data-md-blocks]");
  if (Array.isArray(parsed)) return parsed as Block[];

  return Array.from(prose.querySelectorAll<HTMLElement>("[data-md-range]")).map(
    (element) => {
      const [start, end] = (element.dataset.mdRange ?? "")
        .split("-")
        .map(Number);
      return [start, end] as Block;
    },
  );
};

/**
 * リンクカードと生 HTML は rehype-raw より前では raw ノードなので、サーバー側で
 * 印を付けられない。要素になった後のここで、原文ブロックと突き合わせて補完する。
 */
const fillMissingRanges = (prose: HTMLElement, blocks: Block[]) => {
  const elements = Array.from(
    prose.querySelectorAll<HTMLElement>(
      ":scope > *, :scope > .prose-memo-section > *",
    ),
  ).filter(
    (element) =>
      element.id !== "external-link-new-tab" &&
      element.tagName !== "SCRIPT" &&
      // Prose 側が後から差し込む要素は原文のブロックではない
      !element.classList.contains("prose-memo-section") &&
      !element.classList.contains("prose-memo-note"),
  );
  // 個数が合わないまま割り当てると、編集対象を取り違える
  if (elements.length !== blocks.length) return;

  elements.forEach((element, index) => {
    if (element.dataset.mdRange) return;

    element.dataset.mdRange = blocks[index].join("-");
  });
};

// sessionStorage は環境によっては例外を投げる。覆いが出ないだけで編集は動くようにする
const readStorage = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (entries: Record<string, string | null>) => {
  try {
    for (const [key, value] of Object.entries(entries)) {
      if (value === null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, value);
    }
  } catch {
    /* 引き継げないだけなので続行する */
  }
};

/**
 * 記事を書き換えると Astro 側がページを再読み込みする。描画を二重に走らせないため
 * それに任せ、来なかったときだけ自前で読み込み直す。
 *
 * Astro の再読み込みが遅れるとフォールバックと二重になるので、Vite が再読み込みを
 * 決めた時点で取り下げる。
 */
const armReload = (delay: number) => {
  const timer = window.setTimeout(() => location.reload(), delay);
  import.meta.hot?.on("vite:beforeFullReload", () => clearTimeout(timer));
};

const scheduleReload = (focusIndex: number, staleBody: string) => {
  // 覆い・復帰位置・更新前の本文は再読み込みをまたぐ必要があるため引き継ぐ
  writeStorage({
    [RELOADING_KEY]: "1",
    [FOCUS_KEY]: String(focusIndex),
    [STALE_KEY]: staleBody,
    [RETRY_KEY]: null,
  });
  document.documentElement.dataset.previewReloading = "";

  armReload(RELOAD_FALLBACK);
};

/**
 * 再読み込み後、最後に触ったブロックを画面中央に置いてから覆いを外す。
 *
 * ブラウザ任せの位置復元は、画像などでレイアウトが確定する前に走るため定まらない。
 * 位置はこちらで決め、レイアウトの確定待ちにも上限を置いて白い時間を短く保つ。
 */
const restoreAfterReload = (prose: HTMLElement, currentBody: string) => {
  // 値は空文字なので dataset の真偽で判定してはいけない
  if (!document.documentElement.hasAttribute(RELOADING_ATTRIBUTE)) return;

  const stored = readStorage(FOCUS_KEY);
  const staleBody = readStorage(STALE_KEY);

  // Astro はコンテンツの再同期が終わる前にも再読み込みをかけることがある。
  // 更新前の本文のままなら、覆いを保ったまま次の再読み込みを待つ。
  // ただし待っても変わらない状況で回り続けないよう回数を区切る
  const retry = Number(readStorage(RETRY_KEY) ?? 0);
  if (
    staleBody !== null &&
    staleBody === currentBody &&
    retry < STALE_MAX_RETRY
  ) {
    writeStorage({ [RETRY_KEY]: String(retry + 1) });
    armReload(STALE_RETRY);
    return;
  }

  const elements = Array.from(
    prose.querySelectorAll<HTMLElement>("[data-md-range]"),
  );
  const index = Math.min(
    Math.max(Number(stored ?? -1), 0),
    elements.length - 1,
  );
  const target = stored === null ? undefined : elements[index];

  // scrollIntoView({ block: "center" }) は要素の中心を合わせるため、画面より高い
  // ブロックだと先頭が画面外に出る。画面に収まるものは中央、はみ出すものは先頭を合わせる。
  const focus = () => {
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const half = Math.min(rect.height, window.innerHeight) / 2;
    window.scrollTo({
      top: rect.top + window.scrollY + half - window.innerHeight / 2,
      behavior: "instant",
    });
  };
  focus();

  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;

    // 画像の読み込みでずれた分をもう一度合わせてから見せる
    focus();
    // どのブロックに戻ったのかを一瞬示す。
    // animationend は prefers-reduced-motion で発火しないため時間で外す
    target?.classList.add("block-restored");
    setTimeout(() => target?.classList.remove("block-restored"), HIGHLIGHT_MS);
    requestAnimationFrame(() => {
      delete document.documentElement.dataset.previewReloading;
      history.scrollRestoration = "auto";
      writeStorage({
        [RELOADING_KEY]: null,
        [FOCUS_KEY]: null,
        [STALE_KEY]: null,
        [RETRY_KEY]: null,
      });
    });
  };

  if (document.readyState === "complete") {
    reveal();
    return;
  }
  setTimeout(reveal, REVEAL_MAX_WAIT);
  window.addEventListener("load", reveal, { once: true });
};

const toBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("画像を読み取れませんでした"));
        return;
      }
      resolve(result.slice(result.indexOf(",") + 1));
    });
    reader.addEventListener("error", () =>
      reject(new Error("画像を読み取れませんでした")),
    );
    reader.readAsDataURL(file);
  });

const uploadImage = async (file: File) => {
  const response = await fetch(IMAGE_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ type: file.type, data: await toBase64(file) }),
  });

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      getMessage(payload, `画像の保存に失敗しました (${response.status})`),
    );
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("path" in payload) ||
    typeof payload.path !== "string"
  ) {
    throw new Error("画像の保存先を受け取れませんでした");
  }
  return payload.path;
};

const createToolbar = (host: HTMLElement) => {
  const toolbar = document.createElement("div");
  toolbar.className = "block-toolbar";
  toolbar.hidden = true;

  const buttons = TOOLBAR_BUTTONS.map(([action, label, title]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.action = action;
    if (label === null) {
      const template = host.querySelector(
        `[data-block-toolbar-icon="${action}"]`,
      );
      if (!(template instanceof HTMLTemplateElement)) {
        throw new Error(`Toolbar icon not found: ${action}`);
      }
      button.append(template.content.cloneNode(true));
    } else {
      button.textContent = label;
    }
    button.title = title;
    button.setAttribute("aria-label", title);
    toolbar.append(button);
    return [action, button] as const;
  });

  document.body.append(toolbar);
  return { toolbar, buttons: new Map(buttons) };
};

const requireElement = (root: ParentNode, selector: string) => {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Element not found: ${selector}`);
  }
  return element;
};

const initializeEditor = (host: HTMLElement) => {
  const entryId = host.dataset.entryId;
  if (!entryId) throw new Error("Entry id not found");

  const hint = requireElement(host, "[data-hint]");
  const status = requireElement(host, "[data-status]");
  const counter = requireElement(host, "[data-count]");
  const saveButton = requireElement(host, "[data-save]");
  const discardButton = requireElement(host, "[data-discard]");
  const prose = requireElement(document, ".preview-detail .prose");

  const serverBody = readEmbeddedBody(host);
  if (serverBody === null) throw new Error("Post body not found");

  const blocks = readBlocks(prose);
  if (blocks.length === 0) {
    hint.textContent =
      "この記事は構成上インライン編集に対応していません（本文の位置を特定できませんでした）";
    return;
  }
  fillMissingRanges(prose, blocks);
  restoreAfterReload(prose, serverBody);

  // 印を付けられなかったブロックは要素を持たない。索引はブロック側に合わせる
  const nodes: (HTMLElement | undefined)[] = blocks.map(([start, end]) => {
    const element = prose.querySelector<HTMLElement>(
      `[data-md-range="${start}-${end}"]`,
    );
    return element ?? undefined;
  });

  const { toolbar, buttons } = createToolbar(host);

  let draft: Draft = { body: serverBody, blocks };
  let lastTouched = 0;
  const dirty = new Set<number>();
  let active: {
    index: number;
    mode: EditMode;
    wrapper: HTMLElement;
    textarea: HTMLTextAreaElement;
    status: HTMLElement;
    initial: string;
  } | null = null;
  let hovered: HTMLElement | null = null;
  let hideTimer = 0;
  let busy = false;

  const setStatus = (message: string, isError = false) => {
    const target = active?.status ?? status;
    if (active) status.textContent = "";

    target.textContent = message;
    if (isError) target.dataset.tone = "error";
    else delete target.dataset.tone;
  };

  const syncBar = () => {
    const pending = dirty.size;
    counter.textContent = pending === 0 ? "" : `未保存 ${pending} 箇所`;
    counter.hidden = pending === 0;
    saveButton.toggleAttribute("disabled", pending === 0 || busy);
    discardButton.toggleAttribute("disabled", pending === 0 || busy);
  };

  const textOf = (index: number) => blockText(draft, index);

  const renumber = (from: number) => {
    for (let index = from; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node) node.dataset.mdIndex = String(index);
    }
  };

  const markDirty = (index: number) => {
    dirty.add(index);
    lastTouched = index;
    syncBar();
  };

  /** 索引がずれた分だけ、保留中の印を振り直す */
  const reindexDirty = (map: (index: number) => number | null) => {
    const next = [...dirty].map(map).filter((index) => index !== null);
    dirty.clear();
    next.forEach((index) => dirty.add(index));
  };

  /** 保存前のブロックは描画できないので、生 Markdown のまま置く */
  const createPendingNode = (index: number) => {
    const pending = document.createElement("div");
    pending.className = "block-pending";
    pending.dataset.mdIndex = String(index);

    // pre は typography の既定スタイル（暗い背景）を拾うため div で組む
    const text = document.createElement("div");
    text.className = "block-pending-text";
    text.textContent = textOf(index);

    pending.append(text);
    return pending;
  };

  const applyEdit = (index: number, text: string) => {
    draft = replaceBlock(draft, index, text);
    markDirty(index);

    const node = createPendingNode(index);
    nodes[index]?.replaceWith(node);
    nodes[index] = node;
  };

  const applyInsert = (anchorIndex: number, mode: EditMode, text: string) => {
    const after = mode === "insert-after";
    const result = insertBlock(draft, anchorIndex, mode, text);
    draft = result.draft;

    const { index } = result;
    reindexDirty((i) => (i >= index ? i + 1 : i));
    const node = createPendingNode(index);
    const anchorNode = nodes[anchorIndex];
    anchorNode?.insertAdjacentElement(after ? "afterend" : "beforebegin", node);
    nodes.splice(index, 0, node);
    renumber(index);
    markDirty(index);
  };

  const applyDelete = (index: number) => {
    draft = deleteBlock(draft, index);

    reindexDirty((i) => (i === index ? null : i > index ? i - 1 : i));
    nodes[index]?.remove();
    nodes.splice(index, 1);
    renumber(index);
    markDirty(Math.min(index, draft.blocks.length - 1));
  };

  const applyMove = (index: number, other: number) => {
    const [first, second] = index < other ? [index, other] : [other, index];
    draft = moveBlock(draft, first, second);

    reindexDirty((i) => (i === first ? second : i === second ? first : i));
    const firstNode = nodes[first];
    const secondNode = nodes[second];
    if (firstNode && secondNode) firstNode.replaceWith(secondNode, firstNode);
    [nodes[first], nodes[second]] = [nodes[second], nodes[first]];
    renumber(first);
    markDirty(other);
  };

  // カーソルが少し外れただけで閉じないよう、猶予を置いてから隠す
  const hideToolbar = () => {
    toolbar.hidden = true;
    hovered = null;
  };

  const cancelHide = () => {
    if (hideTimer === 0) return;

    clearTimeout(hideTimer);
    hideTimer = 0;
  };

  const scheduleHide = () => {
    cancelHide();
    hideTimer = window.setTimeout(hideToolbar, TOOLBAR_HIDE_DELAY);
  };

  const indexOf = (node: HTMLElement) => Number(node.dataset.mdIndex ?? -1);

  const showToolbar = (node: HTMLElement) => {
    const index = indexOf(node);
    if (index < 0) return;

    cancelHide();
    hovered = node;
    toolbar.hidden = false;

    buttons.get("up")?.toggleAttribute("disabled", index === 0);
    buttons
      .get("down")
      ?.toggleAttribute("disabled", index === draft.blocks.length - 1);
    buttons
      .get("delete")
      ?.toggleAttribute("disabled", draft.blocks.length <= 1);
    // 先頭より前に足す手段は、先頭ブロックにいるときだけ必要
    buttons.get("insert-before")?.toggleAttribute("hidden", index !== 0);

    // 当たり判定用の余白ぶん、要素の箱は見た目より大きい
    const width = toolbar.offsetWidth - TOOLBAR_HIT_PADDING * 2;
    const height = toolbar.offsetHeight - TOOLBAR_HIT_PADDING * 2;
    const rect = node.getBoundingClientRect();
    const top = Math.max(
      rect.top - height - TOOLBAR_GAP,
      VIEWPORT_MARGIN - window.scrollY,
    );
    const left = Math.min(
      Math.max(rect.right - width, VIEWPORT_MARGIN),
      window.innerWidth - width - VIEWPORT_MARGIN,
    );
    toolbar.style.top = `${top + window.scrollY}px`;
    toolbar.style.left = `${left + window.scrollX}px`;
  };

  const isDirtyEditor = () =>
    active !== null && active.textarea.value !== active.initial;

  const close = () => {
    if (!active) return;

    const { index, mode, wrapper } = active;
    wrapper.remove();
    active = null;
    if (mode === "replace") {
      const node = nodes[index];
      if (node) node.hidden = false;
    }
  };

  const commit = async () => {
    if (busy || dirty.size === 0) return;

    busy = true;
    syncBar();
    setStatus("保存中…");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          id: entryId,
          body: draft.body,
          expected: serverBody,
        }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        throw new Error(
          getMessage(result, `保存に失敗しました (${response.status})`),
        );
      }

      dirty.clear();
      setStatus("反映中…");
      scheduleReload(lastTouched, serverBody);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
      busy = false;
      syncBar();
    }
  };

  const discard = () => {
    if (busy || dirty.size === 0) return;
    if (!window.confirm(`未保存の ${dirty.size} 箇所を破棄しますか？`)) return;

    dirty.clear();
    location.reload();
  };

  const open = (index: number, mode: EditMode) => {
    if (busy) return;
    if (active) {
      setStatus("編集中のブロックがあります", true);
      active.textarea.focus();
      return;
    }

    const node = nodes[index];
    if (!node) return;

    const initial = mode === "replace" ? textOf(index) : "";
    const wrapper = document.createElement("div");
    wrapper.className = "block-editor-wrap";

    const textarea = document.createElement("textarea");
    textarea.className = "block-editor";
    textarea.spellcheck = false;
    textarea.value = initial;
    if (mode !== "replace") textarea.placeholder = "Markdown を入力";

    const inlineStatus = document.createElement("p");
    inlineStatus.className = "block-editor-status";

    const keyHint = document.createElement("span");
    keyHint.className = "block-editor-hint";
    keyHint.textContent = "Shift+Enter で確定";

    const field = document.createElement("div");
    field.className = "block-editor-field";
    field.append(textarea, keyHint);
    wrapper.append(field, inlineStatus);

    if (mode === "insert-after")
      node.insertAdjacentElement("afterend", wrapper);
    else {
      node.insertAdjacentElement("beforebegin", wrapper);
      if (mode === "replace") node.hidden = true;
    }

    active = { index, mode, wrapper, textarea, status: inlineStatus, initial };
    hideToolbar();

    const autosize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    };
    autosize();
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // フォーカスが外れた時点で下書きへ反映する（md への書き込みは保存ボタン）
    const finish = () => {
      if (!active) return;

      const { index: target } = active;
      const text = textarea.value.replace(/\s+$/, "");
      close();

      if (text === "") {
        setStatus(
          "空にはできないため元に戻しました。削除は削除ボタンから",
          true,
        );
        return;
      }
      if (mode === "replace" && text === initial) {
        setStatus("");
        return;
      }

      if (mode === "replace") applyEdit(target, text);
      else applyInsert(target, mode, text);
      setStatus("");
    };

    const insertImage = async (file: File) => {
      // 選択範囲は保存を待つ間に変わりうるので、先に控える
      const previous = textarea.value;
      const from = textarea.selectionStart;
      const to = textarea.selectionEnd;
      // 入力を止めつつフォーカスを保つため readOnly にする
      textarea.readOnly = true;
      setStatus("画像を保存中…");
      try {
        const url = await uploadImage(file);
        const markdown = `![](${url})`;
        textarea.value = `${previous.slice(0, from)}${markdown}${previous.slice(to)}`;
        textarea.setSelectionRange(
          from + markdown.length,
          from + markdown.length,
        );
        setStatus("");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error), true);
      } finally {
        textarea.readOnly = false;
        textarea.focus();
        autosize();
      }
    };

    const pickImageFile = (transfer: DataTransfer | null) =>
      Array.from(transfer?.files ?? []).find((file) =>
        file.type.startsWith("image/"),
      );

    textarea.addEventListener("input", autosize);
    textarea.addEventListener("blur", finish);
    textarea.addEventListener("paste", (event) => {
      const file = pickImageFile(event.clipboardData);
      if (!file) return;

      event.preventDefault();
      void insertImage(file);
    });
    textarea.addEventListener("dragover", (event) => event.preventDefault());
    textarea.addEventListener("drop", (event) => {
      const file = pickImageFile(event.dataTransfer);
      if (!file) return;

      event.preventDefault();
      void insertImage(file);
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        setStatus("");
        return;
      }
      if (
        event.key === "Enter" &&
        (event.shiftKey || event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        finish();
      }
    });
  };

  const addImageBlock = async (index: number, file: File) => {
    if (active || busy) return;

    hideToolbar();
    busy = true;
    syncBar();
    setStatus("画像を保存中…");
    try {
      const url = await uploadImage(file);
      applyInsert(index, "insert-after", `![](${url})`);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
      syncBar();
    }
  };

  const pickImage = (index: number) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/gif,image/webp,image/avif";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) void addImageBlock(index, file);
    });
    input.click();
  };

  const remove = (index: number) => {
    if (active || busy || draft.blocks.length <= 1) return;

    const preview = textOf(index).replace(/\s+/g, " ").slice(0, 60);
    if (!window.confirm(`このブロックを削除します。\n\n${preview}`)) return;

    hideToolbar();
    applyDelete(index);
  };

  const move = (index: number, direction: "up" | "down") => {
    if (active || busy) return;

    const other = direction === "up" ? index - 1 : index + 1;
    if (other < 0 || other >= draft.blocks.length) return;

    hideToolbar();
    applyMove(index, other);
  };

  renumber(0);
  syncBar();

  saveButton.addEventListener("click", () => void commit());
  discardButton.addEventListener("click", discard);
  document.addEventListener("keydown", (event) => {
    if (
      event.key.toLocaleLowerCase() !== "s" ||
      (!event.metaKey && !event.ctrlKey) ||
      event.altKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    if (busy) return;

    active?.textarea.blur();
    void commit();
  });

  // 保存前に再読み込みが走ると保留中の変更が消えるため、明示的に引き止める
  window.addEventListener("beforeunload", (event) => {
    if (dirty.size > 0 || isDirtyEditor()) event.preventDefault();
  });

  prose.addEventListener("pointerover", (event) => {
    if (active || busy) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const node = target.closest<HTMLElement>("[data-md-index]");
    if (node) showToolbar(node);
    else scheduleHide();
  });

  prose.addEventListener("pointerleave", scheduleHide);
  toolbar.addEventListener("pointerover", cancelHide);
  toolbar.addEventListener("pointerleave", scheduleHide);

  toolbar.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !hovered) return;

    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button || !toolbar.contains(button)) return;

    const index = indexOf(hovered);
    if (index < 0) return;

    const action = button.dataset.action;
    if (action === "edit") open(index, "replace");
    else if (action === "up" || action === "down") move(index, action);
    else if (action === "insert-before") open(index, "insert-before");
    else if (action === "insert-after") open(index, "insert-after");
    else if (action === "image") pickImage(index);
    else if (action === "delete") remove(index);
  });

  prose.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // 画像は Lightbox、コードブロックのコピーボタンは本来の動作を優先する
    if (target.tagName === "IMG" || target.closest("button")) return;

    const link = target.closest("a");
    if (link && !link.classList.contains("heading-self-link")) return;

    const node = target.closest<HTMLElement>("[data-md-index]");
    if (!node || node.hidden) return;
    // 範囲選択の終了クリックで編集に入らないようにする
    if (!window.getSelection()?.isCollapsed) return;

    if (link) event.preventDefault();
    open(indexOf(node), "replace");
  });
};

export const initPreviewBodyEdit = () => {
  document
    .querySelectorAll<HTMLElement>("body-editor")
    .forEach(initializeEditor);
};
