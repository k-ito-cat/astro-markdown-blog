import {
  onPageEvent,
  onPageCleanup,
  observePage,
} from "~/scripts/pageLifecycle";
const FEEDBACK_MS = 1600;
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
        previews.forEach((preview, index) => {
          preview.innerHTML = html[index];
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
      if (!pane.open) return;

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

/** 記法ヘルプのコピーと、右ペインの開閉をつなぐ */
export const initPreviewSyntaxHelp = (root: ParentNode = document) => {
  initPanes(root);

  const help = root.querySelector<HTMLDetailsElement>(".body-editor-help");
  if (!help) return;

  initSyntaxPreviews(help);
  initVariants(help);

  const body = help.querySelector<HTMLElement>(".body-editor-help-body");
  const toolbar = help.querySelector<HTMLElement>(".syntax-help-toolbar");
  if (body && toolbar) initGroupNav(body, toolbar);

  help.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-copy-snippet]",
    );
    if (!button) return;

    void copy(button);
  });
};
