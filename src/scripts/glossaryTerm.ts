/**
 * 用語の注釈の吹き出し。
 *
 * 開閉そのものは `popovertarget` が担う。ここで足すのは、Hover で開く動き、
 * popover 未対応環境の代替、`aria-expanded` の同期、位置決めの 4 つ。
 * 位置は anchor positioning がまだ全ブラウザに届かないため、開いた時点の
 * 矩形から計算する。
 */
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 160;
const GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 12;
/*
 * 語が画面の端へ寄ったら閉じる。端に着いてからでは、吹き出しだけが画面に残って
 * どの語の説明か分からなくなる。置く余地が尽きる手前で引く
 */
const DISMISS_MARGIN_PX = 24;

const supportsPopover = "popover" in HTMLElement.prototype;

type Term = {
  root: HTMLElement;
  mark: HTMLElement;
  bubble: HTMLElement;
  timer?: number;
};

const modeIsOn = () => document.documentElement.dataset.glossary === "on";

const isOpen = (bubble: HTMLElement) =>
  supportsPopover
    ? bubble.matches(":popover-open")
    : bubble.hasAttribute("data-open");

/** 語の下へ置き、入らなければ上へ返す。左右は画面内へ収める */
const place = ({ root, bubble }: Term) => {
  const anchor = root.getBoundingClientRect();
  const { width, height } = bubble.getBoundingClientRect();
  const below = anchor.bottom + GAP_PX;
  const above = anchor.top - GAP_PX - height;
  const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN_PX;
  const centered = anchor.left + anchor.width / 2 - width / 2;
  const rightLimit = window.innerWidth - width - VIEWPORT_MARGIN_PX;

  bubble.style.top = `${fitsBelow || above < VIEWPORT_MARGIN_PX ? below : above}px`;
  bubble.style.left = `${Math.max(VIEWPORT_MARGIN_PX, Math.min(centered, rightLimit))}px`;
};

/** 語がまだ画面の中にあり、吹き出しを添える余地があるか */
const anchorInView = ({ root }: Term) => {
  const rect = root.getBoundingClientRect();
  return (
    rect.bottom > DISMISS_MARGIN_PX &&
    rect.top < window.innerHeight - DISMISS_MARGIN_PX
  );
};

const sync = (term: Term) => {
  term.mark.setAttribute("aria-expanded", String(isOpen(term.bubble)));
};

const clearTimer = (term: Term) => {
  if (term.timer === undefined) return;
  window.clearTimeout(term.timer);
  term.timer = undefined;
};

export const initGlossaryTerms = (
  signal: AbortSignal,
  root: ParentNode = document,
) => {
  const terms: Term[] = Array.from(
    root.querySelectorAll<HTMLElement>(".glossary-term"),
  ).flatMap((node) => {
    const mark = node.querySelector<HTMLElement>(".glossary-term-mark");
    const bubble = node.querySelector<HTMLElement>(".glossary-term-bubble");
    return mark && bubble ? [{ root: node, mark, bubble }] : [];
  });

  if (terms.length === 0) return;

  const close = (term: Term) => {
    clearTimer(term);
    if (supportsPopover) {
      if (isOpen(term.bubble)) term.bubble.hidePopover();
      return;
    }
    term.bubble.removeAttribute("data-open");
    sync(term);
  };

  const closeAll = (except?: Term) => {
    terms.forEach((term) => {
      if (term !== except) close(term);
    });
  };

  const open = (term: Term) => {
    clearTimer(term);
    if (!modeIsOn() || isOpen(term.bubble)) return;

    if (supportsPopover) {
      // 位置は toggle で決める。開く前は寸法が取れない
      term.bubble.showPopover();
      return;
    }

    closeAll(term);
    term.bubble.setAttribute("data-open", "");
    place(term);
    sync(term);
  };

  const hoverable = window.matchMedia("(hover: hover)");

  terms.forEach((term) => {
    term.bubble.addEventListener(
      "toggle",
      () => {
        if (isOpen(term.bubble)) place(term);
        sync(term);
      },
      { signal },
    );

    if (!supportsPopover) {
      // popovertarget が効かないぶん、押したときの開閉をここで持つ
      term.mark.addEventListener(
        "click",
        () => (isOpen(term.bubble) ? close(term) : open(term)),
        { signal },
      );
    }

    term.root.addEventListener(
      "pointerenter",
      () => {
        if (!hoverable.matches) return;
        clearTimer(term);
        term.timer = window.setTimeout(() => open(term), OPEN_DELAY_MS);
      },
      { signal },
    );

    // 吹き出しの中も root の子孫なので、読んでいる間は離脱扱いにならない
    term.root.addEventListener(
      "pointerleave",
      () => {
        if (!hoverable.matches) return;
        clearTimer(term);
        term.timer = window.setTimeout(() => close(term), CLOSE_DELAY_MS);
      },
      { signal },
    );
  });

  const reposition = () => {
    terms.forEach((term) => {
      if (!isOpen(term.bubble)) return;
      // 語が画面から出る手前で閉じる。追いかけて端に貼り付かせない
      if (!anchorInView(term)) {
        close(term);
        return;
      }
      place(term);
    });
  };

  window.addEventListener("resize", reposition, { signal });
  window.addEventListener("scroll", reposition, { signal, passive: true });

  if (!supportsPopover) {
    // popover が持っている light dismiss と Escape を自前で補う
    document.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest(".glossary-term")) return;
        closeAll();
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") closeAll();
      },
      { signal },
    );
  }

  // モードを切ると、開いたままの吹き出しが取り残される
  const watchMode = new MutationObserver(() => {
    if (!modeIsOn()) closeAll();
  });
  watchMode.observe(document.documentElement, {
    attributeFilter: ["data-glossary"],
  });
  signal.addEventListener("abort", () => watchMode.disconnect(), {
    once: true,
  });
};
