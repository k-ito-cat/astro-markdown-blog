const ENDPOINT = "/__post";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

const request = async (payload: object) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getMessage(result, `失敗しました (${response.status})`));
  }
  return result;
};

const initializeCreate = (form: HTMLFormElement) => {
  const title = form.querySelector("[data-create-title]");
  const slug = form.querySelector("[data-create-slug]");
  const category = form.querySelector("[data-create-category]");
  const tag = form.querySelector("[data-create-tag]");
  const status = form.querySelector("[data-create-status]");
  if (!(title instanceof HTMLInputElement)) throw new Error("Title not found");
  if (!(slug instanceof HTMLInputElement)) throw new Error("Slug not found");
  if (!(category instanceof HTMLSelectElement))
    throw new Error("Category not found");
  if (!(tag instanceof HTMLSelectElement)) throw new Error("Tag not found");
  if (!(status instanceof HTMLElement)) throw new Error("Status not found");

  const preview = form.querySelector("[data-create-preview]");
  let busy = false;

  if (preview instanceof HTMLElement) {
    slug.addEventListener("input", () => {
      preview.textContent = slug.value === "" ? "slug" : slug.value;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;

    if (!SLUG_PATTERN.test(slug.value)) {
      status.textContent = "slug は英小文字・数字・ハイフンで入力してください";
      status.dataset.tone = "error";
      slug.focus();
      return;
    }

    busy = true;
    delete status.dataset.tone;
    status.textContent = "作成中…";
    try {
      await request({
        action: "create",
        slug: slug.value,
        title: title.value,
        category: category.value,
        tag: tag.value,
      });
      // 作成した記事をそのまま開く
      location.href = `/preview/posts/${slug.value}`;
    } catch (error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
      status.dataset.tone = "error";
      busy = false;
    }
  });
};

const initializeDelete = (button: HTMLButtonElement) => {
  const slug = button.dataset.deletePost;
  const title = button.dataset.postTitle ?? slug;
  if (!slug) throw new Error("Slug not found");

  let busy = false;

  button.addEventListener("click", async () => {
    if (busy) return;
    if (!window.confirm(`「${title}」の md ファイルを削除します。`)) return;

    busy = true;
    try {
      const result = await request({ action: "delete", slug });
      const references =
        typeof result === "object" && result !== null && "references" in result
          ? result.references
          : [];

      // 削除は済んでいるので、参照が残っていることだけ伝えて一覧へ戻る
      if (Array.isArray(references) && references.length > 0) {
        window.alert(
          `削除しました。次の記録がこの記事を参照したままです。\n\n${references.join("\n")}`,
        );
      }
      if (location.pathname === "/preview/posts") location.reload();
      else location.href = "/preview/posts";
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
      busy = false;
    }
  });
};

/**
 * 1 つの初期化が失敗しても、他の操作まで巻き添えで死なせない。
 * 握りつぶすと原因が追えなくなるため、必ずコンソールへ残す。
 */
const initEach = <T extends HTMLElement>(
  selector: string,
  initialize: (element: T) => void,
) => {
  document.querySelectorAll<T>(selector).forEach((element) => {
    try {
      initialize(element);
    } catch (error) {
      console.error(`[preview] ${selector} の初期化に失敗しました`, error);
    }
  });
};

export const initPreviewPostManager = () => {
  initEach<HTMLFormElement>("[data-create-form]", initializeCreate);
  initEach<HTMLButtonElement>("[data-delete-post]", initializeDelete);
};
