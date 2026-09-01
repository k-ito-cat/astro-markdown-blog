import {
  blockText,
  deleteBlock,
  insertBlock,
  mergeDetailsBlocks,
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
/** .block-drag-handle の一辺と一致させること */
const HANDLE_SIZE = 20;
const HANDLE_GAP = 8;
/** 編集中に Cmd/Ctrl + キーで前後へ差し込む記号 */
const INLINE_MARKS: Record<string, string | undefined> = {
  b: "**",
  i: "*",
};
/** Shift を伴う組み合わせ。単独キーだとブラウザの既定操作とぶつかる */
const SHIFT_INLINE_MARKS: Record<string, string | undefined> = {
  m: "==",
};
/** 編集欄の右下に出す操作の手がかり */
const EDITOR_HINTS: [string, string][] = [
  ["⌘B", "太字"],
  ["⌘I", "斜体"],
  ["⌘⇧M", "マーカー"],
  ["⌘⇧`", "コード"],
  ["Shift+Enter", "確定"],
  ["Esc", "取消"],
];
const CODE_FENCE = "```";
const isApple = /Mac|iPhone|iPad/.test(navigator.userAgent);
const DRAG_SCROLL_ZONE = 64;
const DRAG_SCROLL_STEP = 12;
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

/** 本文の左脇に浮かせる掴み手。ツールバーと同じくホバー中のブロックへ寄せる */
const createDragHandle = () => {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "block-drag-handle";
  handle.textContent = "⠿";
  handle.title = "ドラッグでブロックを並び替え";
  handle.setAttribute("aria-label", "ドラッグでブロックを並び替え");
  handle.hidden = true;

  document.body.append(handle);
  return handle;
};

/** ドラッグ中に落ちる位置を示す線 */
const createDropMarker = () => {
  const marker = document.createElement("div");
  marker.className = "block-drop-marker";
  marker.hidden = true;

  document.body.append(marker);
  return marker;
};

/** 範囲選択したブロックに対する操作 */
const createBulkAction = () => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "block-bulk-action";
  button.hidden = true;

  document.body.append(button);
  return button;
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
  const diffButton = requireElement(host, "[data-diff]");
  const discardButton = requireElement(host, "[data-discard]");
  const prose = requireElement(document, ".preview-detail .prose");

  const serverBody = readEmbeddedBody(host);
  if (serverBody === null) throw new Error("Post body not found");

  // 生 HTML のトグルは複数ブロックに割れるため、描画後の 1 要素に合わせる
  const blocks = mergeDetailsBlocks(readBlocks(prose), serverBody);
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
  const dragHandle = createDragHandle();
  const dropMarker = createDropMarker();
  const bulkAction = createBulkAction();

  let draft: Draft = { body: serverBody, blocks };
  let lastTouched = 0;
  const dirty = new Set<number>();
  /**
   * ブロック単位の取り消し先。索引ではなく印の要素をキーにする。
   * 要素の同一性は並べ替えで変わらないので、索引の振り直しが要らない。
   */
  const originals = new Map<
    HTMLElement,
    { text: string; node: HTMLElement | null }
  >();
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
  let diffVisible = true;
  let dragging: {
    index: number;
    node: HTMLElement;
    bounds: { min: number; max: number };
    target: number;
    pointerY: number;
  } | null = null;
  let dragFrame = 0;
  let selected: { anchor: number; from: number; to: number } | null = null;

  const setStatus = (message: string, isError = false) => {
    const target = active?.status ?? status;
    if (active) status.textContent = "";

    target.textContent = message;
    if (isError) target.dataset.tone = "error";
    else delete target.dataset.tone;
  };

  /** 削除したブロックの跡は索引を持たないので、表示の切り替えは DOM から探す */
  const syncDiff = () => {
    prose.dataset.diff = diffVisible ? "on" : "off";
    diffButton.setAttribute("aria-pressed", String(diffVisible));
    prose
      .querySelectorAll<HTMLElement>(".block-removed")
      .forEach((node) => (node.hidden = !diffVisible));
  };

  const syncBar = () => {
    const pending = dirty.size;
    counter.textContent = pending === 0 ? "" : `未保存 ${pending} 箇所`;
    counter.hidden = pending === 0;
    saveButton.toggleAttribute("disabled", pending === 0 || busy);
    discardButton.toggleAttribute("disabled", pending === 0 || busy);
    diffButton.hidden = pending === 0;
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

  const createUndoButton = () => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "block-undo";
    button.dataset.undo = "";
    button.textContent = "戻す";
    button.title = "このブロックの変更を取り消す";
    return button;
  };

  /** 保存前のブロックは描画できないので、生 Markdown のまま置く */
  const createPendingNode = (index: number, kind: "edit" | "insert") => {
    const pending = document.createElement("div");
    pending.className = "block-pending";
    pending.dataset.mdIndex = String(index);
    pending.dataset.kind = kind;

    // pre は typography の既定スタイル（暗い背景）を拾うため div で組む
    const text = document.createElement("div");
    text.className = "block-pending-text";
    text.textContent = textOf(index);

    pending.append(text, createUndoButton());
    return pending;
  };

  /**
   * 削除したブロックの跡。差分として見せるためだけの要素なので、
   * nodes と draft.blocks の索引には入れない（入れると編集対象を取り違える）。
   */
  const createRemovedNode = (text: string) => {
    const removed = document.createElement("div");
    removed.className = "block-removed";
    removed.hidden = !diffVisible;

    const body = document.createElement("div");
    body.className = "block-removed-text";
    body.textContent = text;

    removed.append(body, createUndoButton());
    return removed;
  };

  const applyEdit = (index: number, text: string) => {
    const previous = nodes[index];
    // 差し替える前の姿を控える。ここを逃すと取り消し先が無くなる
    const previousText = textOf(index);
    draft = replaceBlock(draft, index, text);
    markDirty(index);

    // 追加したブロックを編集しても、取り消しは「追加の取り消し」のままにする
    const kind = previous?.dataset.kind === "insert" ? "insert" : "edit";
    const node = createPendingNode(index, kind);
    if (kind === "edit") {
      // 2 回目以降の編集でも、最初の状態を取り消し先として持ち続ける
      const carried = previous ? originals.get(previous) : undefined;
      originals.set(
        node,
        carried ?? { text: previousText, node: previous ?? null },
      );
    }
    if (previous) originals.delete(previous);

    previous?.replaceWith(node);
    nodes[index] = node;
  };

  const applyInsert = (anchorIndex: number, mode: EditMode, text: string) => {
    const after = mode === "insert-after";
    const result = insertBlock(draft, anchorIndex, mode, text);
    draft = result.draft;

    const { index } = result;
    reindexDirty((i) => (i >= index ? i + 1 : i));
    const node = createPendingNode(index, "insert");
    const anchorNode = nodes[anchorIndex];
    anchorNode?.insertAdjacentElement(after ? "afterend" : "beforebegin", node);
    nodes.splice(index, 0, node);
    renumber(index);
    markDirty(index);
  };

  const applyDelete = (index: number) => {
    // 消した後は取り出せないので、跡に残す本文を先に控える
    const removedText = textOf(index);
    const previous = nodes[index];
    draft = deleteBlock(draft, index);

    reindexDirty((i) => (i === index ? null : i > index ? i - 1 : i));
    const marker = createRemovedNode(removedText);
    // 一度も編集していないブロックなら、描画済みの要素をそのまま戻せる
    const rendered =
      previous && !previous.classList.contains("block-pending")
        ? previous
        : null;
    originals.set(marker, { text: removedText, node: rendered });
    if (previous) originals.delete(previous);

    previous?.replaceWith(marker);
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
    // 中身は変わっていないので生 Markdown へは差し替えず、描画したまま印を付ける
    nodes[other]?.classList.add("block-moved");
    markDirty(other);
  };

  // カーソルが少し外れただけで閉じないよう、猶予を置いてから隠す
  const hideToolbar = () => {
    // ドラッグ中は掴み手が消えると操作が途切れる
    if (dragging) return;

    toolbar.hidden = true;
    dragHandle.hidden = true;
    hovered = null;
  };

  /**
   * 掴み手は本文の左脇に出す。左に余白が無い幅では出さず、↑↓ に任せる。
   */
  const positionHandle = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    const left = rect.left - HANDLE_SIZE - HANDLE_GAP;
    if (draft.blocks.length <= 1 || left < VIEWPORT_MARGIN) {
      dragHandle.hidden = true;
      return;
    }

    dragHandle.hidden = false;
    dragHandle.style.top = `${rect.top + window.scrollY}px`;
    dragHandle.style.left = `${left + window.scrollX}px`;
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

    positionHandle(node);

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
    EDITOR_HINTS.forEach(([key, label]) => {
      const item = document.createElement("span");
      const shortcut = document.createElement("kbd");
      shortcut.textContent = isApple ? key : key.replace("⌘", "Ctrl+");
      item.append(shortcut, document.createTextNode(label));
      keyHint.append(item);
    });

    const helpButton = document.createElement("button");
    helpButton.type = "button";
    helpButton.className = "block-editor-help";
    helpButton.title = "記法を開く";
    helpButton.setAttribute("aria-label", "記法を開く");
    const helpIcon = host.querySelector('[data-block-toolbar-icon="help"]');
    if (helpIcon instanceof HTMLTemplateElement) {
      helpButton.append(helpIcon.content.cloneNode(true));
    }
    // 押した時に編集が確定してしまわないよう、フォーカスを textarea に残す
    helpButton.addEventListener("mousedown", (event) => event.preventDefault());
    helpButton.addEventListener("click", () => {
      const help = document.querySelector(".body-editor-help");
      if (help instanceof HTMLDetailsElement) help.open = true;
    });

    const field = document.createElement("div");
    field.className = "block-editor-field";
    field.append(textarea, helpButton, keyHint);
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

      if (text.trim() === "") {
        // 挿入中に空のまま抜けるのは「やめた」であって削除ではない
        if (mode !== "replace") {
          setStatus("");
          return;
        }
        // 本文は空にできないため、最後の 1 ブロックだけは消さずに戻す
        if (draft.blocks.length <= 1) {
          setStatus("本文を空にはできないため元に戻しました", true);
          return;
        }

        applyDelete(target);
        setStatus("ブロックを削除しました");
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

    // 選択範囲をコードフェンスで囲む／既に囲まれていれば外す
    const toggleCodeBlock = () => {
      const value = textarea.value;
      const from = textarea.selectionStart;
      const to = textarea.selectionEnd;
      const selected = value.slice(from, to);
      const lines = selected.split("\n");

      if (
        lines.length >= 2 &&
        lines[0].startsWith(CODE_FENCE) &&
        lines.at(-1)?.trim() === CODE_FENCE
      ) {
        const inner = lines.slice(1, -1).join("\n");
        textarea.value = value.slice(0, from) + inner + value.slice(to);
        textarea.setSelectionRange(from, from + inner.length);
      } else {
        const block = `${CODE_FENCE}\n${selected}\n${CODE_FENCE}`;
        textarea.value = value.slice(0, from) + block + value.slice(to);
        // 言語名をすぐ書けるよう、開いたフェンスの後ろへ置く
        const caret = from + CODE_FENCE.length;
        textarea.setSelectionRange(caret, caret);
      }
      autosize();
    };

    // 選択範囲を記号で囲む／既に囲まれていれば外す
    const toggleInlineMark = (mark: string) => {
      const value = textarea.value;
      const from = textarea.selectionStart;
      const to = textarea.selectionEnd;
      const selected = value.slice(from, to);
      const width = mark.length;
      // `**bold**` を選んで斜体を押したときに、太字を壊さないようにする
      const isBoldSelection = mark === "*" && selected.startsWith("**");

      if (
        !isBoldSelection &&
        selected.length >= width * 2 &&
        selected.startsWith(mark) &&
        selected.endsWith(mark)
      ) {
        // 記号ごと選んでいる場合
        const stripped = selected.slice(width, -width);
        textarea.value = value.slice(0, from) + stripped + value.slice(to);
        textarea.setSelectionRange(from, from + stripped.length);
      } else if (
        value.slice(from - width, from) === mark &&
        value.slice(to, to + width) === mark
      ) {
        // 記号の内側だけを選んでいる場合
        textarea.value =
          value.slice(0, from - width) + selected + value.slice(to + width);
        textarea.setSelectionRange(from - width, to - width);
      } else {
        textarea.value = `${value.slice(0, from)}${mark}${selected}${mark}${value.slice(to)}`;
        // 選択がなければ記号の中へ入れる
        if (from === to) textarea.setSelectionRange(from + width, from + width);
        else textarea.setSelectionRange(from + width, to + width);
      }
      autosize();
    };

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
      if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;

      const key = event.key.toLocaleLowerCase();
      if (event.shiftKey && key === "`") {
        event.preventDefault();
        toggleCodeBlock();
        return;
      }

      const mark = event.shiftKey ? SHIFT_INLINE_MARKS[key] : INLINE_MARKS[key];
      if (!mark) return;

      event.preventDefault();
      toggleInlineMark(mark);
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

  /**
   * 削除の跡は索引を持たない DOM 要素なので、並べ替えたときにどこへ属するかが定まらない。
   * 意味を決めきれないうちは、跡をまたぐ移動を断って位置が狂うのを防ぐ。
   */
  const hasRemovedBetween = (from: HTMLElement, to: HTMLElement) => {
    const forward =
      (from.compareDocumentPosition(to) & Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    const [start, end] = forward ? [from, to] : [to, from];

    for (
      let element = start.nextElementSibling;
      element !== null && element !== end;
      element = element.nextElementSibling
    ) {
      if (element.classList.contains("block-removed")) return true;
    }
    return false;
  };

  const move = (index: number, direction: "up" | "down") => {
    if (active || busy) return;

    const other = direction === "up" ? index - 1 : index + 1;
    if (other < 0 || other >= draft.blocks.length) return;

    const node = nodes[index];
    const otherNode = nodes[other];
    if (node && otherNode && hasRemovedBetween(node, otherNode)) {
      setStatus(
        "削除の跡をまたぐ移動はできません。保存するか破棄してから移動してください",
        true,
      );
      return;
    }

    hideToolbar();
    applyMove(index, other);
  };

  /**
   * 任意位置への移動は、隣り合う入れ替えの繰り返しで表す。
   * moveBlock が正しいのは隣接のときだけで、離れた 2 つを直接入れ替えると
   * 間のブロックの範囲がずれる（本文が壊れる）。
   */
  const reorder = (from: number, to: number) => {
    if (from === to) return;

    const step = from < to ? 1 : -1;
    for (let index = from; index !== to; index += step) {
      const first = Math.min(index, index + step);
      const second = first + 1;

      draft = moveBlock(draft, first, second);
      reindexDirty((i) => (i === first ? second : i === second ? first : i));

      const firstNode = nodes[first];
      const secondNode = nodes[second];
      if (firstNode && secondNode) firstNode.replaceWith(secondNode, firstNode);
      [nodes[first], nodes[second]] = [nodes[second], nodes[first]];
    }

    renumber(Math.min(from, to));
    // 中身は変わっていないので生 Markdown へは差し替えず、描画したまま印を付ける
    nodes[to]?.classList.add("block-moved");
    // 途中経過ではなく、移動そのものを 1 件として数える
    markDirty(to);
  };

  const clearSelection = () => {
    if (!selected) return;

    for (const node of nodes) node?.classList.remove("block-selected");
    bulkAction.hidden = true;
    selected = null;
  };

  const selectBlocks = (anchor: number, focus: number) => {
    clearSelection();

    const from = Math.min(anchor, focus);
    const to = Math.max(anchor, focus);
    selected = { anchor, from, to };

    for (let index = from; index <= to; index += 1) {
      nodes[index]?.classList.add("block-selected");
    }

    const last = nodes[to];
    if (!last) return;

    // 何ブロック消えるのかを、押す前に数字で示す
    bulkAction.textContent = `${to - from + 1}ブロックを削除`;
    bulkAction.hidden = false;
    const rect = last.getBoundingClientRect();
    bulkAction.style.top = `${rect.bottom + window.scrollY + VIEWPORT_MARGIN}px`;
    bulkAction.style.left = `${rect.left + window.scrollX}px`;
  };

  /**
   * ドラッグでのテキスト選択から、触れているブロックを拾う。
   * 1 ブロック内で閉じた選択は、本文をコピーしたいだけの場合が多いので拾わない。
   */
  const selectFromTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);
    if (!prose.contains(range.commonAncestorContainer)) return false;

    const touched: number[] = [];
    nodes.forEach((node, index) => {
      if (node && !node.hidden && range.intersectsNode(node))
        touched.push(index);
    });
    if (touched.length < 2) return false;

    selectBlocks(touched[0], touched[touched.length - 1]);
    return true;
  };

  const bulkDelete = () => {
    if (!selected || active || busy) return;

    const { from, to } = selected;
    const count = to - from + 1;
    if (count >= draft.blocks.length) {
      setStatus("本文を空にはできません", true);
      return;
    }
    if (!window.confirm(`${count}個のブロックを削除します。`)) return;

    clearSelection();
    window.getSelection()?.removeAllRanges();
    // 手前から消すと後続の索引がずれるため、必ず後ろから消す
    for (let index = to; index >= from; index -= 1) applyDelete(index);

    hideToolbar();
    setStatus(`${count}個のブロックを削除しました`);
  };

  const undoInsert = (marker: HTMLElement, index: number) => {
    if (draft.blocks.length <= 1) {
      setStatus("最後のブロックは取り消せません", true);
      return;
    }

    draft = deleteBlock(draft, index);
    reindexDirty((i) => (i === index ? null : i > index ? i - 1 : i));
    originals.delete(marker);
    marker.remove();
    nodes.splice(index, 1);
    renumber(index);
  };

  const undoEdit = (marker: HTMLElement, index: number) => {
    const original = originals.get(marker);
    if (!original) return;

    draft = replaceBlock(draft, index, original.text);
    dirty.delete(index);
    originals.delete(marker);

    if (original.node) {
      marker.replaceWith(original.node);
      nodes[index] = original.node;
      return;
    }
    marker.remove();
    nodes[index] = undefined;
  };

  /** 墓標は索引を持たないので、隣のブロックを起点に挿し直す */
  const undoDelete = (marker: HTMLElement) => {
    const original = originals.get(marker);
    if (!original) return;

    const before = marker.previousElementSibling;
    const after = marker.nextElementSibling;
    const anchor =
      before instanceof HTMLElement && before.dataset.mdIndex
        ? before
        : after instanceof HTMLElement && after.dataset.mdIndex
          ? after
          : null;
    if (!anchor) {
      setStatus("戻す位置を決められませんでした", true);
      return;
    }

    const anchorIndex = indexOf(anchor);
    if (anchorIndex < 0) return;

    const mode = anchor === before ? "insert-after" : "insert-before";
    const result = insertBlock(draft, anchorIndex, mode, original.text);
    draft = result.draft;

    const { index } = result;
    reindexDirty((i) => (i >= index ? i + 1 : i));
    // 編集済みだったブロックは描画済みの姿を持たないので、生 Markdown で戻す
    const node = original.node ?? createPendingNode(index, "insert");
    originals.delete(marker);
    marker.replaceWith(node);
    nodes.splice(index, 0, node);
    renumber(index);
  };

  const undo = (marker: HTMLElement) => {
    if (active || busy) return;

    if (marker.classList.contains("block-removed")) {
      undoDelete(marker);
    } else {
      const index = indexOf(marker);
      if (index < 0) return;

      if (marker.dataset.kind === "insert") undoInsert(marker, index);
      else undoEdit(marker, index);
    }

    hideToolbar();
    // すべて元に戻ったなら、未保存として数える理由がない
    if (draft.body === serverBody) dirty.clear();
    syncBar();
    setStatus("");
  };

  /** 削除の跡をまたげないので、掴んだブロックが動ける範囲を先に出す */
  const dragBounds = (index: number) => {
    let min = index;
    while (min > 0) {
      const current = nodes[min];
      const previous = nodes[min - 1];
      if (!current || !previous || hasRemovedBetween(previous, current)) break;
      min -= 1;
    }

    let max = index;
    while (max < nodes.length - 1) {
      const current = nodes[max];
      const next = nodes[max + 1];
      if (!current || !next || hasRemovedBetween(current, next)) break;
      max += 1;
    }

    return { min, max };
  };

  const targetFrom = (
    clientY: number,
    { min, max }: { min: number; max: number },
  ) => {
    for (let index = min; index <= max; index += 1) {
      const node = nodes[index];
      if (node && clientY < node.getBoundingClientRect().bottom) return index;
    }
    return max;
  };

  const showDropMarker = (target: number) => {
    const node = dragging && target !== dragging.index ? nodes[target] : null;
    if (!node || !dragging) {
      dropMarker.hidden = true;
      return;
    }

    const rect = node.getBoundingClientRect();
    const y = target < dragging.index ? rect.top : rect.bottom;
    dropMarker.hidden = false;
    dropMarker.style.top = `${y + window.scrollY}px`;
    dropMarker.style.left = `${rect.left + window.scrollX}px`;
    dropMarker.style.width = `${rect.width}px`;
  };

  // 指を止めたままでも端で送りたいので、移動イベントではなく毎フレーム見る
  const trackDrag = () => {
    if (!dragging) return;

    const { pointerY } = dragging;
    if (pointerY < DRAG_SCROLL_ZONE) window.scrollBy(0, -DRAG_SCROLL_STEP);
    else if (pointerY > window.innerHeight - DRAG_SCROLL_ZONE) {
      window.scrollBy(0, DRAG_SCROLL_STEP);
    }

    dragging.target = targetFrom(pointerY, dragging.bounds);
    showDropMarker(dragging.target);
    dragFrame = requestAnimationFrame(trackDrag);
  };

  const endDrag = (commitMove: boolean) => {
    if (!dragging) return;

    cancelAnimationFrame(dragFrame);
    const { index, target, node } = dragging;
    node.classList.remove("block-dragging");
    document.body.classList.remove("is-block-dragging");
    dropMarker.hidden = true;
    dragging = null;
    hideToolbar();

    if (commitMove) reorder(index, target);
  };

  dragHandle.addEventListener("pointerdown", (event) => {
    if (active || busy || !hovered) return;

    const index = indexOf(hovered);
    const node = nodes[index];
    if (index < 0 || !node || draft.blocks.length <= 1) return;

    event.preventDefault();
    dragHandle.setPointerCapture(event.pointerId);
    dragging = {
      index,
      node,
      bounds: dragBounds(index),
      target: index,
      pointerY: event.clientY,
    };
    node.classList.add("block-dragging");
    document.body.classList.add("is-block-dragging");
    toolbar.hidden = true;
    trackDrag();
  });

  dragHandle.addEventListener("pointermove", (event) => {
    if (dragging) dragging.pointerY = event.clientY;
  });

  dragHandle.addEventListener("pointerup", () => endDrag(true));
  dragHandle.addEventListener("pointercancel", () => endDrag(false));
  dragHandle.addEventListener("pointerover", cancelHide);
  dragHandle.addEventListener("pointerleave", scheduleHide);

  renumber(0);
  syncBar();
  syncDiff();

  saveButton.addEventListener("click", () => void commit());
  diffButton.addEventListener("click", () => {
    diffVisible = !diffVisible;
    syncDiff();
  });
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

  bulkAction.addEventListener("click", bulkDelete);

  // Shift+クリックはブラウザがテキスト選択を伸ばすので、先に止める
  prose.addEventListener("mousedown", (event) => {
    if (event.shiftKey) event.preventDefault();
  });

  // ドラッグでの選択は離した時点で確定する。
  // 直後に click が来るので、その回だけ解除を見送る印を立てる
  let keepSelection = false;
  prose.addEventListener("mouseup", (event) => {
    if (active || busy || event.shiftKey) return;

    keepSelection = selectFromTextSelection();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") clearSelection();
  });

  prose.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const block = target.closest<HTMLElement>("[data-md-index]");
    if (event.shiftKey) {
      if (active || busy || !block) return;

      event.preventDefault();
      const index = indexOf(block);
      if (index < 0) return;

      // 起点が無ければそのブロックを起点にし、あれば起点から伸ばす
      window.getSelection()?.removeAllRanges();
      selectBlocks(selected?.anchor ?? index, index);
      return;
    }

    // 選択が出ている状態の素のクリックは、まず選択の解除に使う
    if (keepSelection) {
      keepSelection = false;
      return;
    }
    if (selected) {
      clearSelection();
      return;
    }

    const undoButton = target.closest("[data-undo]");
    if (undoButton) {
      const marker = undoButton.closest<HTMLElement>(
        ".block-pending, .block-removed",
      );
      if (marker) undo(marker);
      return;
    }

    // 画像は Lightbox、コピーボタンとトグルの開閉は本来の動作を優先する
    if (target.tagName === "IMG" || target.closest("button, summary")) return;

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
