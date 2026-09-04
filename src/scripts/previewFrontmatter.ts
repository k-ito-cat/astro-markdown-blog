import { initNewTags } from "~/scripts/previewNewTags";
import { initTagDelete } from "~/scripts/previewTagDelete";
import {
  clearSuggestions,
  collectSuggestionBoxes,
  countSuggestions,
  fetchSuggestions,
  renderSuggestions,
} from "~/scripts/previewSuggest";

const ENDPOINT = "/__frontmatter";
const POST_ENDPOINT = "/__post";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const TEXT_FIELDS = [
  "title",
  "publishedAt",
  "updatedAt",
  "thumbnail",
  "githubUrl",
  "status",
  "writingStatus",
  "priority",
] as const;

const LIST_FIELDS = ["categories", "tags"] as const;

type Tone = "success" | "error";

const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja");

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

const getChangedFields = (payload: unknown) => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "changed" in payload &&
    Array.isArray(payload.changed)
  ) {
    return payload.changed.map(String);
  }
  throw new Error("Unexpected response payload");
};

/**
 * 候補は押して初めて入る。タイトルも slug もカテゴリも、
 * 「保存」「変更」を押すまでファイルには反映されない。
 */
const initializeSuggest = ({
  root,
  form,
  entryId,
  addNewTag,
  afterChoiceChange,
}: {
  root: HTMLElement;
  form: HTMLFormElement;
  entryId: string;
  addNewTag: (tag: string) => void;
  afterChoiceChange: () => void;
}) => {
  const button = root.querySelector("[data-fm-suggest]");
  const withBody = root.querySelector("[data-fm-suggest-body]");
  const status = root.querySelector("[data-fm-suggest-status]");
  const title = form.querySelector('[name="title"]');
  if (!(button instanceof HTMLButtonElement)) return;
  if (!(status instanceof HTMLElement)) return;
  if (!(title instanceof HTMLInputElement)) return;

  const slug = root.querySelector("[data-fm-slug-input]");
  const instruction = root.querySelector("[data-fm-instruction]");
  const boxes = collectSuggestionBoxes(root);

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    if (isError) status.dataset.tone = "error";
    else delete status.dataset.tone;
  };

  /** 上限に達しているカテゴリは disabled なので、押しても何も起きない */
  const check = (name: "categories" | "tags", value: string) => {
    const input = form.querySelector<HTMLInputElement>(
      `input[name="${name}"][value="${CSS.escape(value)}"]`,
    );
    if (!input || input.checked || input.disabled) return;

    input.checked = true;
    afterChoiceChange();
  };

  let busy = false;

  const run = async () => {
    const readsBody = withBody instanceof HTMLInputElement && withBody.checked;
    if (busy) return;
    if (title.value.trim() === "") {
      setStatus("タイトルを入力してください", true);
      title.focus();
      return;
    }

    busy = true;
    button.disabled = true;
    setStatus("候補を生成中…");
    try {
      const suggestions = await fetchSuggestions({
        title: title.value,
        // 本文を渡すほど生成が遅くなるため、読ませるかどうかは押した側で決める
        ...(readsBody ? { id: entryId } : {}),
        ...(instruction instanceof HTMLTextAreaElement &&
        instruction.value.trim()
          ? { instruction: instruction.value }
          : {}),
      });
      clearSuggestions(boxes);

      const titlesBox = boxes.get("titles");
      if (titlesBox) {
        renderSuggestions(titlesBox, suggestions.titles, (value) => {
          title.value = value;
        });
      }
      const slugsBox = boxes.get("slugs");
      if (slugsBox && slug instanceof HTMLInputElement) {
        renderSuggestions(
          slugsBox,
          suggestions.slugs,
          (value) => {
            slug.value = value;
          },
          true,
        );
      }
      const newTagsBox = boxes.get("newTags");
      if (newTagsBox) {
        renderSuggestions(newTagsBox, suggestions.newTags, (value) =>
          addNewTag(value),
        );
      }
      (["categories", "tags"] as const).forEach((name) => {
        const box = boxes.get(name);
        if (!box) return;

        renderSuggestions(box, suggestions[name], (value) =>
          check(name, value),
        );
      });

      const total = countSuggestions(suggestions);
      setStatus(
        total === 0
          ? "候補が得られませんでした"
          : "候補をクリックすると入力に入ります。保存するまで反映されません",
        total === 0,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  };

  button.addEventListener("click", () => void run());
};

const initializeEditor = (root: HTMLElement) => {
  const form = root.querySelector("[data-fm-form]");
  const status = root.querySelector("[data-fm-status]");
  const submitButton = root.querySelector("[data-fm-submit]");
  const resetButton = root.querySelector("[data-fm-reset]");
  const tagFilter = root.querySelector("[data-fm-tag-filter]");

  if (!(form instanceof HTMLFormElement)) {
    throw new Error("Frontmatter form not found");
  }
  if (!(status instanceof HTMLElement)) {
    throw new Error("Frontmatter status not found");
  }
  if (!(submitButton instanceof HTMLButtonElement)) {
    throw new Error("Frontmatter submit button not found");
  }
  if (!(resetButton instanceof HTMLButtonElement)) {
    throw new Error("Frontmatter reset button not found");
  }
  if (!(tagFilter instanceof HTMLInputElement)) {
    throw new Error("Frontmatter tag filter not found");
  }

  const entryId = root.dataset.entryId;
  if (!entryId) throw new Error("Entry id not found");

  const maxCategories = Number(root.dataset.maxCategories);
  if (!Number.isInteger(maxCategories) || maxCategories < 1) {
    throw new Error(`Invalid max categories: ${root.dataset.maxCategories}`);
  }

  const categoryInputs = Array.from(
    form.querySelectorAll<HTMLInputElement>("[data-fm-category]"),
  );
  const tagChoices = Array.from(
    form.querySelectorAll<HTMLElement>("[data-fm-tag-choice]"),
  );

  const setStatus = (message: string, tone?: Tone) => {
    status.textContent = message;
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };

  const syncCategoryLimit = () => {
    const selected = categoryInputs.filter((input) => input.checked).length;
    categoryInputs.forEach((input) => {
      input.disabled = !input.checked && selected >= maxCategories;
    });
  };

  const applyTagFilter = () => {
    const query = normalizeSearchText(tagFilter.value.trim());
    tagChoices.forEach((choice) => {
      const input = choice.querySelector("input");
      const isChecked = input instanceof HTMLInputElement && input.checked;
      const tag = normalizeSearchText(choice.dataset.fmTagChoice ?? "");
      choice.hidden = query !== "" && !isChecked && !tag.includes(query);
    });
  };

  const slugInput = root.querySelector<HTMLInputElement>(
    "[data-fm-slug-input]",
  );
  const slugField = root.querySelector<HTMLElement>("[data-fm-slug]");
  const slug = slugField?.dataset.fmSlug ?? "";

  /**
   * slug の実体はファイル名なので、リネームすると今の URL は消える。
   * 旧 URL に戻れないよう履歴を置き換えて新しい URL へ移る。
   */
  const renameSlug = async (nextSlug: string) => {
    if (!SLUG_PATTERN.test(nextSlug)) {
      setStatus(
        "保存しました。slug は英小文字・数字・ハイフンで入力してください",
        "error",
      );
      return;
    }

    setStatus("slug を変更中…");
    const response = await fetch(POST_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ action: "rename", slug, nextSlug }),
    });
    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      setStatus(
        getMessage(payload, `slug の変更に失敗しました (${response.status})`),
        "error",
      );
      return;
    }

    const references =
      typeof payload === "object" && payload !== null && "references" in payload
        ? payload.references
        : [];
    // 変更は済んでいるので、参照が残っていることだけ伝えて新しい slug へ移る
    if (Array.isArray(references) && references.length > 0) {
      window.alert(
        `保存しました。次の記録が旧 slug を参照したままです。\n\n${references.join("\n")}`,
      );
    }

    // 旧 URL はもう無い。ファイル削除を検知した dev サーバーが今のページを
    // 読み直しても新しい URL を見に行くよう、先に履歴を差し替える
    const nextPath = `/preview/posts/${nextSlug}`;
    setStatus("保存しました。新しい URL へ移ります…");
    history.replaceState(null, "", nextPath);
    location.replace(nextPath);
  };

  const newTags = initNewTags(root, (message) => setStatus(message ?? ""));

  const buildPayload = () => {
    const formData = new FormData(form);
    const data: Record<string, string | string[]> = {};

    TEXT_FIELDS.forEach((field) => {
      data[field] = String(formData.get(field) ?? "");
    });
    LIST_FIELDS.forEach((field) => {
      data[field] = formData.getAll(field).map(String);
    });

    // 新しいタグにはまだチェックボックスが無い。記事側にも載せる
    const added = newTags.values();
    data.tags = [...(data.tags as string[]), ...added];
    return { id: entryId, data, newTags: added };
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    submitButton.disabled = true;
    setStatus("保存中…");

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(buildPayload()),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setStatus(
          getMessage(payload, `保存に失敗しました (${response.status})`),
          "error",
        );
        return;
      }

      const changed = getChangedFields(payload);
      const nextSlug = slugInput?.value.trim() ?? "";
      if (slugInput && nextSlug !== slug) {
        // ファイル名の変更は保存の後。旧 id でフロントマターを書いてから移す
        await renameSlug(nextSlug);
        return;
      }

      setStatus(
        changed.length === 0
          ? "変更はありません"
          : `保存しました: ${changed.join(", ")}`,
        "success",
      );
    } catch (error) {
      setStatus(
        `保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      submitButton.disabled = false;
    }
  });

  form.addEventListener("change", () => {
    syncCategoryLimit();
    applyTagFilter();
  });

  initializeSuggest({
    root,
    form,
    entryId,
    addNewTag: (tag) => newTags.add(tag),
    afterChoiceChange: () => {
      syncCategoryLimit();
      applyTagFilter();
    },
  });

  tagFilter.addEventListener("input", applyTagFilter);

  resetButton.addEventListener("click", () => {
    form.reset();
    syncCategoryLimit();
    applyTagFilter();
    setStatus("");
  });

  syncCategoryLimit();
  applyTagFilter();
};

export const initPreviewFrontmatter = () => {
  document
    .querySelectorAll<HTMLElement>("frontmatter-editor")
    .forEach(initializeEditor);
  initTagDelete(document);
};
