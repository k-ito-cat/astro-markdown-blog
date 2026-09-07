const ENDPOINT = "/__pin";

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

/**
 * 一覧の各行にピン留めの切り替えを付ける。
 *
 * 固定の一覧は `src/constants/previewPinned.ts` が正本で、dev サーバーが
 * そのファイルを書き換える。書き換えると Vite が再読み込みするため、
 * 並べ替えはこちらで行わず、サーバーの描画に任せる。
 */
export const initPreviewPinToggle = (root: ParentNode = document) => {
  root.querySelectorAll<HTMLElement>("[data-pin-toggle]").forEach((button) => {
    const slug = button.dataset.pinToggle;
    if (!slug) return;

    button.addEventListener("click", async (event) => {
      // 行全体のクリックで記事へ移らないよう止める
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.busy !== undefined) return;
      button.dataset.busy = "";

      const pinned = button.getAttribute("aria-pressed") === "true";
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: pinned ? "remove" : "add",
            slug,
          }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            getMessage(payload, `失敗しました (${response.status})`),
          );
        }

        button.setAttribute("aria-pressed", String(!pinned));
      } catch (error) {
        window.alert(error instanceof Error ? error.message : String(error));
      } finally {
        delete button.dataset.busy;
      }
    });
  });
};
