const ENDPOINT = "/__frontmatter";

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

  const buildPayload = () => {
    const formData = new FormData(form);
    const data: Record<string, string | string[]> = {};

    TEXT_FIELDS.forEach((field) => {
      data[field] = String(formData.get(field) ?? "");
    });
    LIST_FIELDS.forEach((field) => {
      data[field] = formData.getAll(field).map(String);
    });
    return { id: entryId, data };
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
};
