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

const initSyntaxPreviews = (help: HTMLElement) => {
  const button = help.querySelector<HTMLButtonElement>("[data-preview-toggle]");
  const previews = Array.from(
    help.querySelectorAll<HTMLElement>("[data-syntax-preview]"),
  );
  if (!button || previews.length === 0) return;

  const figures = previews
    .map((preview) => preview.closest<HTMLElement>("[data-help-preview]"))
    .filter((figure): figure is HTMLElement => figure !== null);
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

  const apply = (enabled: boolean, persist = true) => {
    button.setAttribute("aria-pressed", String(enabled));
    if (state) state.textContent = enabled ? "ON" : "OFF";
    figures.forEach((figure) => {
      figure.hidden = !enabled;
    });
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

/** 記法ヘルプのコピーと、右ペインの開閉をつなぐ */
export const initPreviewSyntaxHelp = (root: ParentNode = document) => {
  initPanes(root);

  const help = root.querySelector<HTMLDetailsElement>(".body-editor-help");
  if (!help) return;

  initSyntaxPreviews(help);

  help.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-copy-snippet]",
    );
    if (!button) return;

    void copy(button);
  });
};
