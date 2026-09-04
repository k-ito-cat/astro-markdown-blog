const ENDPOINT = "/__tag";

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

const getUsage = (payload: unknown) => {
  if (typeof payload !== "object" || payload === null || !("used" in payload)) {
    return [];
  }

  const used = (payload as { used: unknown }).used;
  return Array.isArray(used) ? used.map(String) : [];
};

/**
 * 一覧の各タグに削除を付ける。
 * 使用中のタグはサーバーが 409 で拒み、使っている記事を返す。
 */
export const initTagDelete = (root: ParentNode) => {
  root.querySelectorAll<HTMLElement>("[data-tag-delete]").forEach((button) => {
    const tag = button.dataset.tagDelete;
    if (!tag) return;

    button.addEventListener("click", async (event) => {
      // ラベルの中にあるため、チェックが切り替わらないよう止める
      event.preventDefault();
      event.stopPropagation();

      if (!window.confirm(`タグ「${tag}」を定数から削除します。`)) return;

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ action: "delete", tag }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const used = getUsage(payload);
        window.alert(
          [
            getMessage(payload, `削除に失敗しました (${response.status})`),
            ...(used.length > 0 ? ["", ...used] : []),
          ].join("\n"),
        );
        return;
      }

      // tags.ts の変更で dev サーバーが読み直す。待たずに反映させる
      location.reload();
    });
  });
};
