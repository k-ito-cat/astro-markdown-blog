const FEEDBACK_MS = 1600;

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

/**
 * ペインはツールヘッダのすぐ下から始める。
 * ヘッダは追従するまで画面の上端にいないので、高さではなく現在の下端を渡す。
 * 位置はスクロールで変わるため、ペインが開いている間だけ追いかける。
 */
const trackPaneTop = (bar: HTMLElement, panes: HTMLDetailsElement[]) => {
  let frame = 0;

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
  window.addEventListener("scroll", follow, { passive: true });
  window.addEventListener("resize", follow);
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(follow).observe(bar);
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
  if (bar) trackPaneTop(bar, panes);

  panes.forEach((pane) => {
    pane.addEventListener("toggle", () => {
      if (!pane.open) return;

      panes.forEach((other) => {
        if (other !== pane) other.open = false;
      });
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    const opened = panes.find((pane) => pane.open);
    if (!opened) return;

    opened.open = false;
  });

  // 押した時点で判定する。中の要素が処理中に消えると、離す頃には外と区別できない
  document.addEventListener("pointerdown", (event) => {
    const opened = panes.find((pane) => pane.open);
    if (!opened) return;

    const target = event.target as Node | null;
    if (target && opened.contains(target)) return;

    opened.open = false;
  });
};

/** 記法ヘルプのコピーと、右ペインの開閉をつなぐ */
export const initPreviewSyntaxHelp = (root: ParentNode = document) => {
  initPanes(root);

  const help = root.querySelector<HTMLDetailsElement>(".body-editor-help");
  if (!help) return;

  help.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-copy-snippet]",
    );
    if (!button) return;

    void copy(button);
  });
};
