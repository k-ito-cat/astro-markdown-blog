const FEEDBACK_MS = 1600;

const setState = (button: HTMLElement, state: "copied" | "failed") => {
  button.dataset.copyState = state;
  window.setTimeout(() => delete button.dataset.copyState, FEEDBACK_MS);
};

const copy = async (button: HTMLElement) => {
  const path = button.dataset.copyLink;
  if (!path) throw new Error("Copy target not found");

  // 開いている場所を基準にする。preview ではプレビューの URL、公開側では公開 URL になる
  const url = new URL(path, location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    setState(button, "copied");
  } catch {
    setState(button, "failed");
  }
};

export const initCopyLink = (root: ParentNode = document) => {
  root.querySelectorAll<HTMLElement>("[data-copy-link]").forEach((button) => {
    button.addEventListener("click", (event) => {
      // 一覧の行やリンクの内側に置くため、親の遷移を止める
      event.preventDefault();
      event.stopPropagation();
      void copy(button);
    });
  });
};
