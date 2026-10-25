import {
  onPageEvent,
  onPageCleanup,
  observePage,
} from "~/scripts/pageLifecycle";
const FEEDBACK_MS = 1600;
const TOC_HOVER_OPEN_MS = 200;
const TOC_HOVER_CLOSE_MS = 250;
const TOC_MARGIN = 8;
const PREVIEW_STORAGE_KEY = "preview-syntax-help:previews";

/**
 * ペインは summary、Escape、ペイン外の押下、他ペインの表示と四方から閉じられる。
 * 中身が閉じてよいかを知っているのはペイン側なので、判断だけを預かって全経路で参照する。
 */
const closeGuards = new WeakMap<HTMLDetailsElement, () => boolean>();

export const setPaneCloseGuard = (
  pane: HTMLDetailsElement,
  guard: () => boolean,
) => {
  closeGuards.set(pane, guard);
};

const canClosePane = (pane: HTMLDetailsElement) =>
  closeGuards.get(pane)?.() ?? true;

/**
 * ペインの中で開いた目次（popover）は、Escape や外の押下をブラウザが先に受けて閉じる。
 * そのときペインまで閉じると、目次だけ閉じたい操作で両方消えるので、判定に使う
 */
const hasOpenPopover = (pane: HTMLDetailsElement) =>
  pane.querySelector(":popover-open") !== null;

const setState = (button: HTMLElement, state: "copied" | "failed") => {
  button.dataset.copyState = state;
  window.setTimeout(() => delete button.dataset.copyState, FEEDBACK_MS);
};

const copy = async (button: HTMLElement) => {
  const snippet = button.dataset.copySnippet;
  if (!snippet) return;

  try {
    await navigator.clipboard.writeText(snippet);
    setState(button, "copied");
  } catch {
    setState(button, "failed");
  }
};

/** 排他の追加指定は、見た目が 1 つでは足りない。押した分へ差し替える */
const initVariants = (help: HTMLElement) => {
  help
    .querySelectorAll<HTMLElement>("[data-help-preview]")
    .forEach((figure) => {
      const buttons = Array.from(
        figure.querySelectorAll<HTMLButtonElement>("[data-variant-index]"),
      );
      if (buttons.length === 0) return;

      const contents = Array.from(
        figure.querySelectorAll<HTMLElement>("[data-syntax-preview]"),
      );

      buttons.forEach((button, at) => {
        // 押しただけで編集が終わらないよう、フォーカスは編集欄に残す
        button.addEventListener("mousedown", (event) => event.preventDefault());
        button.addEventListener("click", () => {
          buttons.forEach((other, index) => {
            other.setAttribute("aria-pressed", String(index === at));
          });
          contents.forEach((content, index) => {
            content.hidden = index !== at;
          });
        });
      });
    });
};

const initSyntaxPreviews = (help: HTMLElement) => {
  const button = help.querySelector<HTMLButtonElement>("[data-preview-toggle]");
  const previews = Array.from(
    help.querySelectorAll<HTMLElement>("[data-syntax-preview]"),
  );
  if (!button || previews.length === 0) return;

  const state = button.querySelector<HTMLElement>(".help-preview-toggle-state");
  let loaded = false;
  let loading: Promise<void> | null = null;

  const load = () => {
    if (loaded) return Promise.resolve();
    if (loading) return loading;

    previews.forEach((preview) => {
      preview.textContent = "表示例を読み込んでいます…";
    });

    loading = fetch("/__syntax-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snippets: previews.map(
          (preview) => preview.dataset.previewSnippet ?? "",
        ),
      }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const value = (await response.json()) as { html?: unknown };
        if (
          !Array.isArray(value.html) ||
          value.html.length !== previews.length ||
          value.html.some((html) => typeof html !== "string")
        ) {
          throw new Error("Invalid response");
        }

        // 上の検証を通った時点で中身は文字列だけなので、その形で受け直す
        const html = value.html as string[];
        // innerHTML では宣言的 Shadow DOM が働かず、UIプレビュー（CMP-017）が空になる。
        // 使えるブラウザでは setHTMLUnsafe で入れる
        previews.forEach((preview, index) => {
          if ("setHTMLUnsafe" in preview) preview.setHTMLUnsafe(html[index]);
          else preview.innerHTML = html[index];
        });
        loaded = true;
      })
      .catch((error) => {
        console.error("[preview] 記法の表示例を読み込めませんでした", error);
        previews.forEach((preview) => {
          preview.textContent = "表示例を読み込めませんでした。";
        });
      })
      .finally(() => {
        loading = null;
      });

    return loading;
  };

  /** 雛形と表示例は同じ場所で入れ替える。切り替えの語と中身を合わせる */
  const showView = (item: HTMLElement, view: "code" | "preview") => {
    item.querySelectorAll<HTMLElement>("[data-help-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.helpPane !== view;
    });
    item
      .querySelectorAll<HTMLElement>("[data-help-view]")
      .forEach((switchItem) => {
        switchItem.setAttribute(
          "aria-pressed",
          String(switchItem.dataset.helpView === view),
        );
      });
    if (view === "preview") void load();
  };

  const items = Array.from(help.querySelectorAll<HTMLElement>(".help-item"));

  help.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const switchItem = target.closest<HTMLElement>("[data-help-view]");
    const item = switchItem?.closest<HTMLElement>(".help-item");
    if (!switchItem || !item) return;

    showView(
      item,
      switchItem.dataset.helpView === "preview" ? "preview" : "code",
    );
  });

  // 押しただけで編集が終わらないよう、フォーカスは編集欄に残す
  help.addEventListener("mousedown", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest("[data-help-view]")) {
      event.preventDefault();
    }
  });

  /** 道具の行の切り替えは、すべての項目をまとめて動かす */
  const apply = (enabled: boolean, persist = true) => {
    button.setAttribute("aria-pressed", String(enabled));
    if (state) state.textContent = enabled ? "ON" : "OFF";
    items.forEach((item) => showView(item, enabled ? "preview" : "code"));
    if (enabled) void load();

    if (!persist) return;
    try {
      sessionStorage.setItem(PREVIEW_STORAGE_KEY, enabled ? "on" : "off");
    } catch {
      // 保存できなくても、このページでの切り替えは続ける
    }
  };

  button.addEventListener("click", () => {
    apply(button.getAttribute("aria-pressed") !== "true");
  });

  help.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-syntax-preview] a")) event.preventDefault();
  });

  let enabled = false;
  try {
    enabled = sessionStorage.getItem(PREVIEW_STORAGE_KEY) === "on";
  } catch {
    // sessionStorage が使えないときは既定の OFF にする
  }
  apply(enabled, false);
};

/**
 * ペインはツールヘッダのすぐ下から始める。
 * ヘッダは追従するまで画面の上端にいないので、高さではなく現在の下端を渡す。
 * 位置はスクロールで変わるため、ペインが開いている間だけ追いかける。
 */
const trackPaneTop = (bar: HTMLElement, panes: HTMLDetailsElement[]) => {
  let frame = 0;
  onPageCleanup(() => cancelAnimationFrame(frame));

  const apply = () => {
    frame = 0;
    const top = Math.max(0, Math.round(bar.getBoundingClientRect().bottom));
    document.documentElement.style.setProperty(
      "--preview-pane-top",
      `${top}px`,
    );
  };

  const schedule = () => {
    if (frame) return;

    frame = requestAnimationFrame(apply);
  };

  const follow = () => {
    if (!panes.some((pane) => pane.open)) return;

    schedule();
  };

  panes.forEach((pane) => pane.addEventListener("toggle", apply));
  onPageEvent(window, "scroll", follow, { passive: true });
  onPageEvent(window, "resize", follow);
  if (typeof ResizeObserver !== "undefined") {
    observePage(new ResizeObserver(follow)).observe(bar);
  }

  apply();
};

/**
 * 右から出るペイン（記法、フロントマター）は同じ場所に重なる。
 * 一つ開いたら他は閉じ、Escape でも閉じられるようにする。
 */
const initPanes = (root: ParentNode) => {
  const panes = Array.from(
    root.querySelectorAll<HTMLDetailsElement>("[data-preview-pane]"),
  );
  if (panes.length === 0) return;

  const bar = root.querySelector<HTMLElement>(".body-editor-bar");
  const mobileActions = root.querySelector<HTMLDetailsElement>(
    "[data-body-editor-more]",
  );
  if (bar) trackPaneTop(bar, panes);

  mobileActions
    ?.querySelectorAll<HTMLElement>("[data-mobile-pane]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const selector = button.dataset.mobilePane;
        const pane = selector
          ? root.querySelector<HTMLDetailsElement>(selector)
          : null;
        if (!pane) return;

        mobileActions.open = false;
        pane.open = true;
      });
    });

  mobileActions?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!event.target.closest("button")) return;

    mobileActions.open = false;
  });

  panes.forEach((pane) => {
    pane.addEventListener("toggle", () => {
      // 中で開いた目次は最上層にいるので、ペインを閉じても残る。一緒に閉じる
      if (!pane.open) {
        pane.querySelector<HTMLElement>(":popover-open")?.hidePopover();
        return;
      }

      // 開いた側を引っ込める。閉じられないペインの上に重ねるより、開かない方が迷わない
      const blocked = panes.some(
        (other) => other !== pane && other.open && !canClosePane(other),
      );
      if (blocked) {
        pane.open = false;
        return;
      }

      panes.forEach((other) => {
        if (other !== pane) other.open = false;
      });
    });
  });

  onPageEvent(document, "keydown", (event) => {
    if (event.key !== "Escape") return;

    const opened = panes.find((pane) => pane.open);
    if (!opened) {
      if (mobileActions) mobileActions.open = false;
      return;
    }

    // 目次が開いていれば、ブラウザが目次だけを閉じる
    if (hasOpenPopover(opened)) return;
    if (!canClosePane(opened)) return;

    opened.open = false;
  });

  // 押した時点で判定する。中の要素が処理中に消えると、離す頃には外と区別できない
  onPageEvent(document, "pointerdown", (event) => {
    const opened = panes.find((pane) => pane.open);
    if (!opened) {
      if (
        mobileActions?.open &&
        !(event.target instanceof Node && mobileActions.contains(event.target))
      ) {
        mobileActions.open = false;
      }
      return;
    }

    const target = event.target as Node | null;
    if (target && opened.contains(target)) return;
    if (hasOpenPopover(opened)) return;
    if (!canClosePane(opened)) return;

    opened.open = false;
  });
};

/**
 * 記法ペインの地図。塊ごとの帯を、実際の高さの比で縦に並べる。
 *
 * 40 項目を縦に積んだ一覧なので、いま全体のどこを見ているかが分からなくなる。
 * 中身を縮小しても文字は読めないため、塊の名前と占める長さだけを写す。
 * 帯は押せるようにして、索引としても使えるようにする。
 */
/** 送り先の位置。offsetParent に頼らず、いまの見た目から測る */
const offsetIn = (pane: HTMLElement, node: HTMLElement) =>
  node.getBoundingClientRect().top -
  pane.getBoundingClientRect().top +
  pane.scrollTop;

/**
 * 塊への案内。記法は 8 つの塊に分かれていて縦に長いので、名前から直接送れるようにする。
 *
 * 道具の行に相乗りさせ、入りきらない幅では横へ送る。いま見ている塊は
 * `design/hig.md` の nav.current に従い、色・太さ・Line の 3 つで示す。
 */
const initGroupNav = (pane: HTMLElement, toolbar: HTMLElement) => {
  const groups = Array.from(pane.querySelectorAll<HTMLElement>(".help-group"));
  if (groups.length === 0) return;

  const nav = document.createElement("nav");
  nav.className = "help-group-nav";
  nav.setAttribute("aria-label", "記法の分類");

  const items = groups.map((group) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "help-group-nav-item";
    button.textContent = group.querySelector("h2")?.textContent?.trim() ?? "";
    // 押しただけで編集が終わらないよう、フォーカスは編集欄に残す
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      pane.scrollTo({ top: offsetIn(pane, group) });
    });
    nav.append(button);
    return { button, group };
  });

  toolbar.prepend(nav);

  /** 送るたびに測り直さないよう、塊の位置は測った時点のものを持ち回る */
  let offsets: number[] = [];

  const measure = () => {
    offsets = items.map(({ group }) => offsetIn(pane, group));
  };

  let shown = -1;

  /** 案内が横へ溢れているとき、現在地を見える位置まで送る */
  const reveal = (button: HTMLElement) => {
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < nav.scrollLeft) nav.scrollLeft = left;
    else if (right > nav.scrollLeft + nav.clientWidth) {
      nav.scrollLeft = right - nav.clientWidth;
    }
  };

  const syncCurrent = () => {
    // 吸着した見出しの下に来ている塊を、いま見ているものとする
    const at = pane.scrollTop + toolbar.offsetHeight + 1;
    let current = 0;
    offsets.forEach((top, index) => {
      if (top <= at) current = index;
    });
    // 末尾の塊は残りが画面より短く、頭が吸着線まで上がらない。底に着いたら最後とする
    const atBottom =
      pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
    if (atBottom) current = offsets.length - 1;
    if (current === shown) return;

    shown = current;
    items.forEach(({ button }, index) => {
      const isCurrent = index === current;
      button.classList.toggle("is-current", isCurrent);
      if (isCurrent) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    reveal(items[current].button);
  };

  measure();
  syncCurrent();
  pane.addEventListener("scroll", syncCurrent);

  // 表示例の開閉で中身の高さが変わる。位置を測り直す
  const observer = new ResizeObserver(() => {
    measure();
    shown = -1;
    syncCurrent();
  });
  groups.forEach((group) => observer.observe(group));
  onPageCleanup(() => observer.disconnect());
};

/**
 * 項目への目次。塊の名前からは、脚注のようにどの塊にあるか分からない項目を辿れない。
 * 項目名を並べて押せば送れるようにする。
 */
const initToc = (pane: HTMLElement, toolbar: HTMLElement) => {
  const toc = pane.querySelector<HTMLElement>("[data-help-toc]");
  const rail = pane.querySelector<HTMLElement>("[data-help-toc-trigger]");
  if (!toc || !rail) return;

  const entries = Array.from(
    toc.querySelectorAll<HTMLElement>("[data-help-toc-target]"),
  ).flatMap((button) => {
    const id = button.dataset.helpTocTarget ?? "";
    const item = document.getElementById(id);
    const dash = rail.querySelector<HTMLElement>(
      `[data-help-toc-dash="${id}"]`,
    );
    return item && dash ? [{ button, dash, item }] : [];
  });
  if (entries.length === 0) return;

  // 押しただけで編集が終わらないよう、フォーカスは編集欄に残す
  [rail, toc].forEach((element) => {
    element.addEventListener("mousedown", (event) => event.preventDefault());
  });

  /** 吸着した帯と塊の見出しの下へ、項目の頭を出す位置 */
  const topOf = (item: HTMLElement) => {
    const heading = item.closest(".help-group")?.querySelector("h2");
    return (
      offsetIn(pane, item) - toolbar.offsetHeight - (heading?.offsetHeight ?? 0)
    );
  };

  /** 線の列に重ねて右端を揃え、上下の中心も揃える。ペインの上端と画面の下端からははみ出さない */
  const place = () => {
    const anchor = rail.getBoundingClientRect();
    const panel = toc.getBoundingClientRect();
    const paneTop = pane.getBoundingClientRect().top;
    const centered = anchor.top + anchor.height / 2 - panel.height / 2;
    const top = Math.max(
      paneTop + TOC_MARGIN,
      Math.min(centered, window.innerHeight - panel.height - TOC_MARGIN),
    );
    toc.style.right = `${window.innerWidth - anchor.right}px`;
    toc.style.top = `${top}px`;
  };

  /** 続きがある側の端だけを溶かす */
  const list = toc.querySelector<HTMLElement>("nav");
  const syncEdges = () => {
    if (!list) return;

    const above = list.scrollTop > 0;
    const below = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
    list.toggleAttribute("data-more-above", above);
    list.toggleAttribute("data-more-below", below);
  };
  list?.addEventListener("scroll", syncEdges, { passive: true });

  /*
   * hover で開いたものは離れると閉じ、押して開いたものは閉じる操作まで残す。
   * 開くまで待つのは、右端のスクロールバーへ向かう途中で開かないようにするため
   */
  let openedByHover = false;
  let timer = 0;
  const cancel = () => window.clearTimeout(timer);
  const schedule = (action: () => void, ms: number) => {
    cancel();
    timer = window.setTimeout(action, ms);
  };
  onPageCleanup(cancel);

  const isOpen = () => toc.matches(":popover-open");

  rail.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "mouse") return;
    if (isOpen()) {
      cancel();
      return;
    }

    schedule(() => {
      openedByHover = true;
      toc.showPopover();
    }, TOC_HOVER_OPEN_MS);
  });

  toc.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") cancel();
  });

  [rail, toc].forEach((element) => {
    element.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "mouse") return;
      if (!isOpen()) {
        cancel();
        return;
      }
      if (!openedByHover) return;

      schedule(() => toc.hidePopover(), TOC_HOVER_CLOSE_MS);
    });
  });

  toc.addEventListener("toggle", (event) => {
    if (!(event instanceof ToggleEvent)) return;
    if (event.newState === "open") {
      place();
      syncEdges();
      return;
    }

    openedByHover = false;
    cancel();
  });

  toc.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest<HTMLElement>("[data-help-toc-target]");
    const entry = entries.find((candidate) => candidate.button === button);
    if (!entry) return;

    pane.scrollTo({ top: topOf(entry.item) });
    toc.hidePopover();
  });

  /** 送るたびに測り直さないよう、項目の位置は測った時点のものを持ち回る */
  let offsets: number[] = [];
  const measure = () => {
    offsets = entries.map(({ item }) => topOf(item));
  };

  let shown = -1;
  const syncCurrent = () => {
    const at = pane.scrollTop + 1;
    let current = 0;
    offsets.forEach((top, index) => {
      if (top <= at) current = index;
    });
    // 末尾の項目は頭が吸着線まで上がらない。底に着いたら最後とする
    const atBottom =
      pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 1;
    if (atBottom) current = offsets.length - 1;
    if (current === shown) return;

    shown = current;
    entries.forEach(({ button, dash }, index) => {
      const isCurrent = index === current;
      dash.classList.toggle("is-current", isCurrent);
      button.classList.toggle("is-current", isCurrent);
      if (isCurrent) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  };

  measure();
  syncCurrent();
  pane.addEventListener("scroll", syncCurrent);

  // 表示例の開閉で中身の高さが変わる。位置を測り直す
  const observer = new ResizeObserver(() => {
    measure();
    shown = -1;
    syncCurrent();
  });
  pane
    .querySelectorAll<HTMLElement>(".help-group")
    .forEach((group) => observer.observe(group));
  onPageCleanup(() => observer.disconnect());
};

/** 記法ヘルプのコピーと、右ペインの開閉をつなぐ */
export const initPreviewSyntaxHelp = (root: ParentNode = document) => {
  initPanes(root);

  const help = root.querySelector<HTMLDetailsElement>(".body-editor-help");
  if (!help) return;

  initSyntaxPreviews(help);
  initVariants(help);

  const body = help.querySelector<HTMLElement>(".body-editor-help-body");
  const toolbar = help.querySelector<HTMLElement>(".syntax-help-toolbar");
  if (body && toolbar) {
    initGroupNav(body, toolbar);
    initToc(body, toolbar);
  }

  help.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-copy-snippet]",
    );
    if (!button) return;

    void copy(button);
  });
};
