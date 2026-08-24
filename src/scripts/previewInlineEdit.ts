const ENDPOINT = "/__frontmatter";
const POPOVER_GAP = 4;
const VIEWPORT_MARGIN = 8;

type ChoiceField = "priority" | "writingStatus" | "status";

const CHOICE_DATASET_KEYS: Record<ChoiceField, string> = {
  priority: "priority",
  writingStatus: "writing",
  status: "publication",
};

const isChoiceField = (value: string): value is ChoiceField =>
  value in CHOICE_DATASET_KEYS;

const parseStringArray = (value: string, field: string) => {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    !parsed.every((item) => typeof item === "string")
  ) {
    throw new Error(`${field} must be a string array`);
  }
  return parsed;
};

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

const saveField = async (
  entryId: string,
  field: string,
  value: string | string[],
) => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({ id: entryId, data: { [field]: value } }),
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(
      getMessage(payload, `保存に失敗しました (${response.status})`),
    );
  }
};

const initializeRow = (row: HTMLTableRowElement, maxCategories: number) => {
  const entryId = row.dataset.entryId;
  if (!entryId) throw new Error("Entry id not found");

  const status = row.querySelector("[data-edit-status]");
  const titleDisplay = row.querySelector("[data-title-display]");
  const titleTrigger = row.querySelector("[data-title-trigger]");
  const titleInput = row.querySelector("[data-title-input]");
  const dateInput = row.querySelector("[data-edit-date]");
  const categoryTrigger = row.querySelector("[data-category-trigger]");
  const categoryLabel = row.querySelector("[data-category-label]");
  const categoryPopover = row.querySelector("[data-category-popover]");
  const priorityDot = row.querySelector("[data-priority-dot]");

  if (!(status instanceof HTMLElement))
    throw new Error("Edit status not found");
  if (!(titleDisplay instanceof HTMLElement)) {
    throw new Error("Title display not found");
  }
  if (!(titleTrigger instanceof HTMLButtonElement)) {
    throw new Error("Title trigger not found");
  }
  if (!(titleInput instanceof HTMLInputElement)) {
    throw new Error("Title input not found");
  }
  if (!(dateInput instanceof HTMLInputElement)) {
    throw new Error("Date input not found");
  }
  if (!(categoryTrigger instanceof HTMLButtonElement)) {
    throw new Error("Category trigger not found");
  }
  if (!(categoryLabel instanceof HTMLElement)) {
    throw new Error("Category label not found");
  }
  if (!(categoryPopover instanceof HTMLElement)) {
    throw new Error("Category popover not found");
  }
  if (!(priorityDot instanceof HTMLElement)) {
    throw new Error("Priority dot not found");
  }

  const choiceSelects = Array.from(
    row.querySelectorAll<HTMLSelectElement>("[data-edit-select]"),
  );
  const categoryInputs = Array.from(
    categoryPopover.querySelectorAll<HTMLInputElement>("[data-category-input]"),
  );

  const setStatus = (message: string, isError = false) => {
    status.textContent = message;
    if (isError) status.dataset.tone = "error";
    else delete status.dataset.tone;
  };

  const syncCategoryLimit = () => {
    const selected = categoryInputs.filter((input) => input.checked).length;
    categoryInputs.forEach((input) => {
      input.disabled = !input.checked && selected >= maxCategories;
    });
  };

  const getCategories = () =>
    categoryInputs.filter((input) => input.checked).map((input) => input.value);

  const commit = async (
    field: string,
    value: string | string[],
    apply: () => void,
    revert: () => void,
  ) => {
    row.dataset.saving = "true";
    setStatus("保存中…");
    try {
      await saveField(entryId, field, value);
      apply();
      setStatus("");
    } catch (error) {
      revert();
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      delete row.dataset.saving;
    }
  };

  const closeTitleInput = () => {
    titleInput.hidden = true;
    titleDisplay.hidden = false;
    titleTrigger.hidden = false;
  };

  const openTitleInput = () => {
    titleInput.value = row.dataset.title ?? "";
    titleDisplay.hidden = true;
    titleTrigger.hidden = true;
    titleInput.hidden = false;
    titleInput.focus();
    titleInput.select();
  };

  const commitTitle = async () => {
    if (row.dataset.saving) return;

    const value = titleInput.value.trim();
    if (value === "") {
      setStatus("タイトルは必須です", true);
      return;
    }
    if (value === row.dataset.title) {
      closeTitleInput();
      setStatus("");
      return;
    }
    await commit(
      "title",
      value,
      () => {
        row.dataset.title = value;
        titleDisplay.textContent = value;
        closeTitleInput();
      },
      () => {},
    );
  };

  titleTrigger.addEventListener("click", openTitleInput);
  titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitle();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeTitleInput();
      setStatus("");
      titleTrigger.focus();
    }
  });
  titleInput.addEventListener("blur", () => {
    if (titleInput.hidden) return;
    void commitTitle();
  });

  choiceSelects.forEach((select) => {
    const field = select.dataset.editSelect ?? "";
    if (!isChoiceField(field)) {
      throw new Error(`Unknown editable field: ${field}`);
    }
    const datasetKey = CHOICE_DATASET_KEYS[field];

    select.addEventListener("change", () => {
      const value = select.value;
      const previous = row.dataset[datasetKey] ?? "";
      void commit(
        field,
        value,
        () => {
          row.dataset[datasetKey] = value;
          if (field === "priority") {
            priorityDot.dataset.priorityValue = value;
          }
        },
        () => {
          select.value = previous;
        },
      );
    });
  });

  dateInput.addEventListener("change", () => {
    const value = dateInput.value;
    const previous = row.dataset.updated ?? "";
    if (value === "") {
      dateInput.value = previous;
      setStatus("更新日は必須です", true);
      return;
    }
    void commit(
      "updatedAt",
      value,
      () => {
        row.dataset.updated = value;
      },
      () => {
        dateInput.value = previous;
      },
    );
  });

  categoryInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const value = getCategories();
      const previous = parseStringArray(
        row.dataset.categories ?? "[]",
        "categories",
      );
      if (value.length === 0) {
        input.checked = true;
        syncCategoryLimit();
        setStatus("カテゴリは1件以上必要です", true);
        return;
      }
      syncCategoryLimit();
      void commit(
        "categories",
        value,
        () => {
          row.dataset.categories = JSON.stringify(value);
          categoryLabel.textContent = value.join(" · ");
        },
        () => {
          categoryInputs.forEach((categoryInput) => {
            categoryInput.checked = previous.includes(categoryInput.value);
          });
          syncCategoryLimit();
        },
      );
    });
  });

  categoryPopover.addEventListener("toggle", (event) => {
    if (!(event instanceof ToggleEvent) || event.newState !== "open") return;

    const anchor = categoryTrigger.getBoundingClientRect();
    const panel = categoryPopover.getBoundingClientRect();
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchor.left, window.innerWidth - panel.width - VIEWPORT_MARGIN),
    );
    const overflowsBottom =
      anchor.bottom + POPOVER_GAP + panel.height >
      window.innerHeight - VIEWPORT_MARGIN;
    const top = overflowsBottom
      ? Math.max(VIEWPORT_MARGIN, anchor.top - POPOVER_GAP - panel.height)
      : anchor.bottom + POPOVER_GAP;

    categoryPopover.style.left = `${left}px`;
    categoryPopover.style.top = `${top}px`;
  });

  syncCategoryLimit();
};

export const initPreviewInlineEdit = (root: HTMLElement) => {
  const maxCategories = Number(root.dataset.maxCategories);
  if (!Number.isInteger(maxCategories) || maxCategories < 1) {
    throw new Error(`Invalid max categories: ${root.dataset.maxCategories}`);
  }

  root
    .querySelectorAll<HTMLTableRowElement>("[data-post-row]")
    .forEach((row) => initializeRow(row, maxCategories));
};
