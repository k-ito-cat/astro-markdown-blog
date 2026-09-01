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

/** 記法ヘルプのコピーと、本文へ戻るための閉じる操作をつなぐ */
export const initPreviewSyntaxHelp = (root: ParentNode = document) => {
  const help = root.querySelector<HTMLDetailsElement>(".body-editor-help");
  if (!help) return;

  help.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      "[data-copy-snippet]",
    );
    if (!button) return;

    void copy(button);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !help.open) return;

    help.open = false;
  });
};
