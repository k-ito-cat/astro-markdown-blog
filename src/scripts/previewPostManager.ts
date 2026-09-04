import { normalizeSearchText } from "~/utils/previewPost";
import { initNewTags } from "~/scripts/previewNewTags";
import { initTagDelete } from "~/scripts/previewTagDelete";
import {
  clearSuggestions,
  collectSuggestionBoxes,
  countSuggestions,
  fetchSuggestions,
  renderSuggestions,
} from "~/scripts/previewSuggest";

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

const request = async (payload: object, endpoint: string = ENDPOINT) => {
  const response = await fetch(endpoint, {
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

type ChoiceGroup = {
  name: "categories" | "tags";
  inputs: HTMLInputElement[];
  selected: HTMLElement | null;
  max: number;
  values: () => string[];
  check: (value: string) => void;
  sync: () => void;
};

/** 絞り込みは選択済みを常に残す。隠れている間に外れると気づけない */
const initializeChoiceGroup = (
  fieldset: HTMLElement,
  onChange: () => void,
): ChoiceGroup => {
  const name =
    fieldset.dataset.createGroup === "categories" ? "categories" : "tags";
  // 選択肢が少ない群は絞り込みも選択済み表示も持たない
  const filter = fieldset.querySelector<HTMLInputElement>(
    "[data-create-filter]",
  );
  const selected = fieldset.querySelector<HTMLElement>(
    "[data-create-selected]",
  );

  const choices = Array.from(
    fieldset.querySelectorAll<HTMLElement>("[data-create-choice]"),
  );
  const inputs = choices
    .map((choice) => choice.querySelector("input"))
    .filter((input): input is HTMLInputElement => input !== null);
  const parsedMax = Number(fieldset.dataset.createMax);
  const max =
    Number.isInteger(parsedMax) && parsedMax > 0 ? parsedMax : inputs.length;

  const values = () =>
    inputs.filter((input) => input.checked).map((input) => input.value);

  /** 絞り込みは選択済みを常に残す。隠れている間に外れると気づけない */
  const applyFilter = () => {
    const query = normalizeSearchText(filter?.value.trim() ?? "");
    choices.forEach((choice) => {
      const input = choice.querySelector("input");
      const isChecked = input instanceof HTMLInputElement && input.checked;
      const label = normalizeSearchText(choice.dataset.createChoice ?? "");
      choice.hidden = query !== "" && !isChecked && !label.includes(query);
    });
  };

  const renderSelected = () => {
    if (!selected) return;

    selected.textContent = "";
    values().forEach((value) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "create-chip";
      chip.textContent = value;
      chip.addEventListener("click", () => {
        const input = inputs.find((candidate) => candidate.value === value);
        if (!input) return;

        input.checked = false;
        sync();
        onChange();
      });
      selected.append(chip);
    });
  };

  const sync = () => {
    const count = values().length;
    // 上限に達したら、選べないものを触れなくする
    inputs.forEach((input) => {
      input.disabled = !input.checked && count >= max;
    });
    renderSelected();
    applyFilter();
  };

  /** 上限に達していれば何もしない */
  const check = (value: string) => {
    const input = inputs.find((candidate) => candidate.value === value);
    if (!input || input.checked || input.disabled) return;

    input.checked = true;
    sync();
  };

  fieldset.addEventListener("change", () => {
    sync();
    onChange();
  });
  filter?.addEventListener("input", applyFilter);
  sync();

  return { name, inputs, selected, max, values, check, sync };
};

const initializeCreate = (dialog: HTMLDialogElement) => {
  const form = dialog.querySelector("[data-create-form]");
  const title = dialog.querySelector("[data-create-title]");
  const slug = dialog.querySelector("[data-create-slug]");
  const suggest = dialog.querySelector("[data-create-suggest]");
  const status = dialog.querySelector("[data-create-status]");
  const preview = dialog.querySelector("[data-create-preview]");
  const instruction = dialog.querySelector("[data-create-instruction]");
  const body = dialog.querySelector("[data-create-body]");
  if (!(form instanceof HTMLFormElement)) throw new Error("Form not found");
  if (!(title instanceof HTMLInputElement)) throw new Error("Title not found");
  if (!(slug instanceof HTMLInputElement)) throw new Error("Slug not found");
  if (!(suggest instanceof HTMLButtonElement))
    throw new Error("Suggest button not found");
  if (!(status instanceof HTMLElement)) throw new Error("Status not found");
  if (!(preview instanceof HTMLElement)) throw new Error("Preview not found");

  let busy = false;

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    if (isError) status.dataset.tone = "error";
    else delete status.dataset.tone;
  };

  const syncPreview = () => {
    preview.textContent = slug.value === "" ? "slug" : slug.value;
  };

  const newTags = initNewTags(dialog, (message) => setStatus(message ?? ""));

  const groups = Array.from(
    dialog.querySelectorAll<HTMLElement>("[data-create-group]"),
  ).map((fieldset) => initializeChoiceGroup(fieldset, () => setStatus("")));
  const valuesOf = (name: ChoiceGroup["name"]) =>
    groups.find((group) => group.name === name)?.values() ?? [];

  document.querySelectorAll("[data-create-open]").forEach((button) => {
    button.addEventListener("click", () => {
      setStatus("");
      dialog.showModal();
      title.focus();
    });
  });
  dialog.querySelectorAll("[data-create-close]").forEach((button) => {
    button.addEventListener("click", () => dialog.close());
  });

  // closedby="any" 未対応（Safari）でも背景クリックで閉じられるようにする
  if (!("closedBy" in HTMLDialogElement.prototype)) {
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;

      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (inside) return;

      dialog.close();
    });
  }

  slug.addEventListener("input", syncPreview);
  syncPreview();

  const suggestionBoxes = collectSuggestionBoxes(dialog);

  suggest.addEventListener("click", async () => {
    if (busy) return;
    if (title.value.trim() === "") {
      setStatus("先にタイトルを入力してください", true);
      title.focus();
      return;
    }

    busy = true;
    suggest.disabled = true;
    setStatus("候補を生成中…");
    try {
      const suggestions = await fetchSuggestions({
        title: title.value,
        ...(instruction instanceof HTMLTextAreaElement &&
        instruction.value.trim()
          ? { instruction: instruction.value }
          : {}),
      });
      clearSuggestions(suggestionBoxes);

      const titlesBox = suggestionBoxes.get("titles");
      if (titlesBox) {
        renderSuggestions(titlesBox, suggestions.titles, (value) => {
          title.value = value;
        });
      }
      const slugsBox = suggestionBoxes.get("slugs");
      if (slugsBox) {
        renderSuggestions(
          slugsBox,
          suggestions.slugs,
          (value) => {
            slug.value = value;
            syncPreview();
          },
          true,
        );
      }
      const newTagsBox = suggestionBoxes.get("newTags");
      if (newTagsBox) {
        renderSuggestions(newTagsBox, suggestions.newTags, (value) =>
          newTags.add(value),
        );
      }
      groups.forEach((group) => {
        const box = suggestionBoxes.get(group.name);
        if (!box) return;

        renderSuggestions(box, suggestions[group.name], (value) =>
          group.check(value),
        );
      });

      const total = countSuggestions(suggestions);
      setStatus(
        total === 0
          ? "候補が得られませんでした。手入力してください"
          : "候補をクリックすると入力に反映されます",
        total === 0,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      busy = false;
      suggest.disabled = false;
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;

    if (!SLUG_PATTERN.test(slug.value)) {
      setStatus("slug は英小文字・数字・ハイフンで入力してください", true);
      slug.focus();
      return;
    }
    const categories = valuesOf("categories");
    // 新しいタグにはまだチェックボックスが無い。記事側にも載せる
    const added = newTags.values();
    const tags = [...valuesOf("tags"), ...added];
    if (categories.length === 0) {
      setStatus("カテゴリを 1 件以上選んでください", true);
      return;
    }
    if (tags.length === 0) {
      setStatus("タグを 1 件以上選んでください", true);
      return;
    }

    busy = true;
    setStatus("作成中…");
    try {
      const bodyMode = dialog.querySelector<HTMLInputElement>(
        "[data-create-body-mode]:checked",
      );
      const fields: Record<string, string> = {};
      dialog
        .querySelectorAll<
          HTMLInputElement | HTMLSelectElement
        >("[data-create-field]")
        .forEach((field) => {
          const key = field.dataset.createField;
          // 空欄はテンプレートの既定値のままにする
          if (key && field.value !== "") fields[key] = field.value;
        });

      await request({
        action: "create",
        slug: slug.value,
        title: title.value,
        categories,
        tags,
        newTags: added,
        fields,
        ...(body instanceof HTMLTextAreaElement && body.value.trim()
          ? { body: body.value, bodyMode: bodyMode?.value ?? "body" }
          : {}),
      });
      // 作成した記事をそのまま開く。ストアが追いつくまでの間は
      // 404 ページ側が読み直して待つ
      location.href = `/preview/posts/${slug.value}`;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
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
  initEach<HTMLDialogElement>("[data-create-dialog]", initializeCreate);
  initTagDelete(document);
  initEach<HTMLButtonElement>("[data-delete-post]", initializeDelete);
};
