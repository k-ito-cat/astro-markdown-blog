const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja");

const getElements = () => {
  const input = document.querySelector("#post-search-input");
  const count = document.querySelector("#post-count");
  if (!(input instanceof HTMLInputElement) || !(count instanceof HTMLElement))
    return null;
  return {
    input,
    count,
    items: Array.from(
      document.querySelectorAll<HTMLElement>("[data-record-entry]"),
    ),
    groups: Array.from(
      document.querySelectorAll<HTMLElement>("[data-date-group]"),
    ),
    empty: document.querySelector<HTMLElement>("[data-search-empty]"),
    clears: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-search-clear]"),
    ),
    categoryFilter: document.querySelector<HTMLElement>(
      "[data-category-filter]",
    ),
    categoryName: document.querySelector<HTMLElement>("[data-category-name]"),
    total: Number(count.dataset.total ?? "0"),
  };
};

const updateView = (
  elements: NonNullable<ReturnType<typeof getElements>>,
  query: string,
  category: string | null,
) => {
  const normalizedQuery = normalize(query.trim());
  let visible = 0;
  elements.items.forEach((item) => {
    const categories = JSON.parse(item.dataset.categories ?? "[]") as string[];
    const matchesCategory = !category || categories.includes(category);
    const matchesQuery =
      !normalizedQuery ||
      normalize(item.dataset.searchText ?? "").includes(normalizedQuery);
    const match = matchesCategory && matchesQuery;
    item.hidden = !match;
    if (match) visible += 1;
  });

  elements.groups.forEach((group) => {
    let next = group.nextElementSibling;
    let hasVisibleItem = false;
    while (next && !next.matches("[data-date-group]")) {
      if (next.matches("[data-record-entry]:not([hidden])"))
        hasVisibleItem = true;
      next = next.nextElementSibling;
    }
    group.hidden = !hasVisibleItem;
  });

  const hasCondition = Boolean(normalizedQuery || category);
  elements.count.textContent = `${hasCondition ? visible : elements.total}件の記録`;
  if (elements.empty) elements.empty.hidden = !(hasCondition && visible === 0);
  elements.clears.forEach((button) => {
    button.hidden = !hasCondition;
  });
  if (elements.categoryFilter) elements.categoryFilter.hidden = !category;
  if (elements.categoryName) elements.categoryName.textContent = category ?? "";
};

export const initPostSearch = () => {
  const elements = getElements();
  if (!elements) return;
  let category = new URL(window.location.href).searchParams.get("category");
  const clear = () => {
    elements.input.value = "";
    category = null;
    window.history.replaceState(null, "", "/blog");
    updateView(elements, "", category);
    elements.input.focus();
  };

  updateView(elements, elements.input.value, category);
  elements.input.addEventListener("input", () =>
    updateView(elements, elements.input.value, category),
  );
  elements.clears.forEach((button) => button.addEventListener("click", clear));
  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const isEditing =
      target instanceof HTMLElement &&
      (target.matches("input, textarea, select") || target.isContentEditable);
    if (
      event.key === "/" &&
      !isEditing &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      elements.input.focus();
    }
    if (
      event.key === "Escape" &&
      document.activeElement === elements.input &&
      elements.input.value
    )
      clear();
  });
};
