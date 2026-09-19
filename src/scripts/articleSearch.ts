/**
 * 記事内のテキスト検索。
 *
 * ヒットは CSS Custom Highlight API で塗る。本文の DOM を書き換えないので、
 * 用語の注釈や脚注など、本文の要素に依存する他の script と食い合わない。
 * 未対応のブラウザでは色が付かないだけで、件数と一覧と移動はそのまま動く。
 *
 * 塗りはダイアログを閉じても残す。探して飛んだ先がどこだったかを、
 * 本文を読む間も見えるようにしておく。
 *
 * 検索語の突き合わせは小文字化だけにする。postSearch のように NFKC まで
 * 掛けると文字数が変わり、塗る範囲が本文からずれる。
 */
import { onPageCleanup, onPageEvent } from "~/scripts/pageLifecycle";
import type { Occurrence } from "~/scripts/searchHighlight";
import {
  findOccurrences,
  paintHighlight,
  supportsHighlight,
  toRange,
} from "~/scripts/searchHighlight";

const HIGHLIGHT_ALL = "article-search";
const HIGHLIGHT_CURRENT = "article-search-current";

/** 一覧に並べる上限。これを超えた分は件数だけ伝える */
const LIST_LIMIT = 20;

/*
 * 文の切れ目。読点や小数点で切ると語の途中で切れるので、和文の終止符だけ見る。
 * 改行も段落内の切れ目として扱う
 */
const SENTENCE_END = /[。！？!?\n]/u;

/** 文脈を採るまとまり。行ではなくブロックで見る */
const BLOCK =
  "p, li, blockquote, dd, td, th, h1, h2, h3, h4, h5, h6, figcaption";

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Hit = {
  range: Range;
  before: string;
  text: string;
  after: string;
  /** プレビュー用。ヒットを含むブロック全体と、その中でのヒットの位置 */
  context: string;
  at: number;
  length: number;
};

/** その text node が、ブロック全体の何文字目から始まるか */
const offsetInBlock = (block: Element, target: Text) => {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let offset = 0;

  while (walker.nextNode()) {
    if (walker.currentNode === target) return offset;
    offset += (walker.currentNode.nodeValue ?? "").length;
  }

  return offset;
};

/** 改行と連続した空白は1つに畳む */
const flatten = (source: string) => source.replace(/\s+/gu, " ");

const toHit = (occurrence: Occurrence): Hit => {
  const { node, at, length } = occurrence;
  const range = toRange(occurrence);

  // 文脈はブロック全体から採る。強調や注釈でタグに切られた語もつながる
  const block = node.parentElement?.closest(BLOCK);
  const source = block?.textContent ?? node.nodeValue ?? "";
  const start = block ? offsetInBlock(block, node) + at : at;
  const end = start + length;

  // ヒットを含む一文を、頭から丸ごと出す。行に収まらない分は CSS が省略する
  let from = 0;
  for (let i = start - 1; i >= 0; i -= 1) {
    if (SENTENCE_END.test(source[i] ?? "")) {
      from = i + 1;
      break;
    }
  }

  let to = source.length;
  for (let i = end; i < source.length; i += 1) {
    if (SENTENCE_END.test(source[i] ?? "")) {
      to = i + 1;
      break;
    }
  }

  return {
    range,
    before: flatten(source.slice(from, start)).trimStart(),
    text: flatten(source.slice(start, end)),
    after: flatten(source.slice(end, to)),
    context: source,
    at: start,
    length,
  };
};

const collectHits = (root: HTMLElement, query: string) =>
  findOccurrences(root, query).map(toHit);

/** ヒットが画面の中央に来るまで送る。sticky なヘッダーや目次に隠れないため */
const scrollToHit = (hit: Hit) => {
  const rect = hit.range.getBoundingClientRect();
  window.scrollTo({
    top: window.scrollY + rect.top - window.innerHeight / 2,
    behavior: prefersReducedMotion() ? "instant" : "smooth",
  });
};

export const initArticleSearch = (signal: AbortSignal) => {
  const prose = document.querySelector<HTMLElement>(".prose");
  const dialog = document.querySelector<HTMLDialogElement>(
    "[data-article-search-dialog]",
  );
  const input = dialog?.querySelector<HTMLInputElement>(
    "[data-article-search-input]",
  );
  const count = dialog?.querySelector<HTMLElement>(
    "[data-article-search-count]",
  );
  const list = dialog?.querySelector<HTMLElement>("[data-article-search-hits]");
  const rest = dialog?.querySelector<HTMLElement>("[data-article-search-rest]");
  const results = dialog?.querySelector<HTMLElement>(
    "[data-article-search-results]",
  );
  const preview = dialog?.querySelector<HTMLElement>(
    "[data-article-search-preview]",
  );
  const previewBody = dialog?.querySelector<HTMLElement>(
    "[data-article-search-preview-body]",
  );
  const close = dialog?.querySelector<HTMLButtonElement>(
    "[data-article-search-close]",
  );
  if (
    !prose ||
    !dialog ||
    !input ||
    !count ||
    !list ||
    !rest ||
    !close ||
    !results ||
    !preview ||
    !previewBody
  )
    return;

  const entries = Array.from(
    document.querySelectorAll<HTMLElement>("[data-article-search-entry-group]"),
  );

  let hits: Hit[] = [];
  /**
   * 選んでいるヒット。一覧の印、本文の濃い塗り、右のプレビューが同じものを指す。
   * ヒットが無い間は -1
   */
  let current = -1;

  const paint = () => {
    paintHighlight(
      HIGHLIGHT_ALL,
      hits.map((hit) => hit.range),
    );
    const hit = hits[current];
    paintHighlight(HIGHLIGHT_CURRENT, hit ? [hit.range] : []);
  };

  /*
   * 入口へ今の語を映す。ダイアログを閉じたあとに語だけ残って、消す手が
   * どこにも無い状態を作らない
   */
  const syncEntries = (query: string) => {
    entries.forEach((entry) => {
      const label = entry.querySelector<HTMLElement>(
        "[data-article-search-label]",
      );
      const reset = entry.querySelector<HTMLButtonElement>(
        "[data-article-search-reset]",
      );
      if (label) label.textContent = query || "記事内を検索";
      if (reset) reset.hidden = query === "";
      entry.toggleAttribute("data-active", query !== "");
    });
  };

  /* 選んだヒットを含む段落を丸ごと出す。飛ぶ前に、そこで合っているか見る */
  const renderPreview = () => {
    const hit = hits[current];
    if (!hit) {
      previewBody.replaceChildren();
      return;
    }

    const mark = document.createElement("mark");
    mark.textContent = hit.context.slice(hit.at, hit.at + hit.length);
    previewBody.replaceChildren(
      hit.context.slice(0, hit.at),
      mark,
      hit.context.slice(hit.at + hit.length),
    );

    // 長い段落では、ヒットが見えるところまでプレビューの中だけを送る
    preview.scrollTop = Math.max(
      0,
      mark.offsetTop - preview.clientHeight / 2 - preview.offsetTop,
    );
  };

  const render = () => {
    const query = input.value.trim();
    count.textContent = !query
      ? ""
      : hits.length === 0
        ? "見つからない"
        : `${hits.length}件`;

    // 語があるうちは語を消す操作、空なら閉じる操作として使う
    close.setAttribute("aria-label", query ? "検索を解除" : "閉じる");
    syncEntries(query);

    list.replaceChildren();

    hits.slice(0, LIST_LIMIT).forEach((hit, order) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.hitIndex = String(order);
      if (order === current) button.setAttribute("aria-current", "true");

      const index = document.createElement("span");
      index.className = "hit-index";
      index.textContent = String(order + 1);

      const text = document.createElement("span");
      text.className = "hit-text";
      const mark = document.createElement("mark");
      mark.textContent = hit.text;
      text.append(hit.before, mark, hit.after);

      button.append(index, text);
      item.append(button);
      list.append(item);
    });

    const remainder = hits.length - LIST_LIMIT;
    rest.hidden = remainder <= 0;
    rest.textContent = remainder > 0 ? `他 ${remainder} 件` : "";

    results.hidden = hits.length === 0;
    renderPreview();
  };

  const search = () => {
    hits = collectHits(prose, input.value.trim());
    current = hits.length > 0 ? 0 : -1;
    paint();
    render();
  };

  const clear = () => {
    input.value = "";
    search();
  };

  /*
   * 選び直す。一覧の印、本文の濃い塗り、右のプレビューを同じヒットへ揃える。
   * 一覧は建て直さない。建て直すと、キーボードで選んだボタンごと消えて
   * フォーカスが本文へ落ちる
   */
  const select = (index: number) => {
    if (hits.length === 0) return;
    current = Math.min(Math.max(index, 0), hits.length - 1);

    items().forEach((button) => {
      if (Number(button.dataset.hitIndex) === current)
        button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });

    paint();
    renderPreview();
  };

  /** 本文を送るのはここだけ。打っている最中は呼ばない */
  const goTo = (index: number) => {
    if (hits.length === 0) return;
    select(index);
    const hit = hits[current];
    if (!hit) return;

    paint();
    render();
    dialog.close();
    scrollToHit(hit);
  };

  const items = () =>
    Array.from(list.querySelectorAll<HTMLButtonElement>("[data-hit-index]"));

  /** 矢印での行き来。上端は折り返さず入力欄へ返す */
  const focusItem = (index: number) => {
    if (index < 0) {
      input.focus();
      return;
    }
    select(index);
    const buttons = items();
    buttons[Math.min(index, buttons.length - 1)]?.focus();
  };

  /*
   * ソフトキーボードが出ると、見えている画面は半分ほどになる。vh も dvh も
   * キーボードでは縮まないので、実寸を visualViewport から CSS へ渡す。
   * offsetTop は、キーボードに押されて画面がずれたぶんを戻すために見る
   */
  const viewport = window.visualViewport;
  const syncViewport = () => {
    if (!viewport) return;
    dialog.style.setProperty("--search-viewport", `${viewport.height}px`);
    dialog.style.setProperty("--search-shift", `${viewport.offsetTop}px`);
  };

  const open = () => {
    if (!dialog.open) dialog.showModal();
    syncViewport();
    input.focus();
    input.select();
  };

  if (viewport) {
    viewport.addEventListener("resize", syncViewport, { signal });
    viewport.addEventListener("scroll", syncViewport, { signal });
  }

  input.addEventListener("input", search, { signal });

  dialog.addEventListener(
    "keydown",
    (event) => {
      /*
       * 変換中のキーは IME のものなので、一つも横取りしない。矢印は候補選び、
       * Escape は変換の取り消し、Enter は確定に使われている。
       * Safari は compositionend を keydown より先に配って isComposing が
       * 戻ってしまうため、keyCode 229 も見る
       */
      if (event.isComposing || event.keyCode === 229) return;

      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("[data-hit-index]")
          : null;

      if (event.key === "Escape") {
        // 語が残っているうちは解除が先。もう一度押したらダイアログを閉じる
        if (input.value === "") return;
        event.preventDefault();
        clear();
        input.focus();
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (hits.length === 0) return;
        event.preventDefault();

        const from = button ? items().indexOf(button) : -1;
        if (!button) {
          focusItem(event.key === "ArrowDown" ? 0 : hits.length - 1);
          return;
        }
        focusItem(from + (event.key === "ArrowDown" ? 1 : -1));
        return;
      }

      if (event.key !== "Enter" || button) return;
      event.preventDefault();
      goTo(current);
    },
    { signal },
  );

  list.addEventListener(
    "click",
    (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("[data-hit-index]")
          : null;
      if (!button) return;
      goTo(Number(button.dataset.hitIndex));
    },
    { signal },
  );

  /* バツは語を消す。空のときだけ閉じる操作になる。Escapeと同じ二段にする */
  close.addEventListener(
    "click",
    () => {
      if (input.value === "") {
        dialog.close();
        return;
      }
      clear();
      input.focus();
    },
    { signal },
  );

  // 面の外を押したら閉じる。dialog 自身の領域は面の外側まで含む
  dialog.addEventListener(
    "click",
    (event) => {
      if (event.target === dialog) dialog.close();
    },
    { signal },
  );

  document
    .querySelectorAll<HTMLElement>("[data-article-search-entry]")
    .forEach((entry) => entry.addEventListener("click", open, { signal }));

  document
    .querySelectorAll<HTMLButtonElement>("[data-article-search-reset]")
    .forEach((reset) =>
      reset.addEventListener("click", () => clear(), { signal }),
    );

  /*
   * 狭幅のバーに置いた虫眼鏡。ヘッダーは記事の公開状態を知らないので、
   * 畳んだ状態で出しておき、検索が実際にあるこの script から見せる
   */
  const barEntry = document.querySelector<HTMLButtonElement>(
    "[data-article-search-open]",
  );
  if (barEntry) {
    barEntry.hidden = false;
    barEntry.addEventListener(
      "click",
      () => {
        // メニューを開いたまま重ねない。開いているときだけ畳んでから出す
        const menu =
          document.querySelector<HTMLDetailsElement>("[data-mobile-menu]");
        if (menu?.open)
          document
            .querySelector<HTMLElement>("[data-mobile-menu-summary]")
            ?.click();
        open();
      },
      { signal },
    );
  }

  /*
   * ダイアログを閉じたあとの Escape でも語を解除できるようにする。
   * 他の入力欄で打っている最中は横取りしない
   */
  onPageEvent(window, "keydown", (event) => {
    if (event.key !== "Escape" || dialog.open || input.value === "") return;
    if (event.isComposing || event.keyCode === 229) return;

    const active = document.activeElement;
    if (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable)
    )
      return;

    clear();
  });

  /*
   * Cmd / Ctrl+F は記事内検索へ回す。記事ページではブラウザ標準の検索は開かない。
   * 本文も欄外も同じ一つの検索で探せるほうが、同じキーで別のものが出るより迷わない
   */
  onPageEvent(window, "keydown", (event) => {
    if (event.key !== "f" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    open();
  });

  // 記事を離れても塗りは registry に残るため、片付けを page の後始末へ預ける
  onPageCleanup(() => {
    if (!supportsHighlight()) return;
    CSS.highlights.delete(HIGHLIGHT_ALL);
    CSS.highlights.delete(HIGHLIGHT_CURRENT);
  });
};
