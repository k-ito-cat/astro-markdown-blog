const getElements = () => {
  const input = document.querySelector("#post-search-input");
  if (!(input instanceof HTMLInputElement)) return null;
  const count = document.querySelector("#post-count");
  if (!(count instanceof HTMLElement)) return null;

  const items = Array.from(
    document.querySelectorAll<HTMLElement>("ul > li[data-title]")
  );
  const pagination = document.querySelector<HTMLElement>("[data-pagination]");
  const total = Number(count.getAttribute("data-total") ?? "0");

  return { input, count, items, pagination, total };
};

const updateView = (elements: ReturnType<typeof getElements>, query: string) => {
  if (!elements) return;
  const queryLower = query.trim().toLowerCase();
  let visible = 0;

  elements.items.forEach((item) => {
    const title = item.getAttribute("data-title") ?? "";
    const match = queryLower.length === 0 || title.includes(queryLower);
    item.classList.toggle("hidden", !match);
    item.setAttribute("aria-hidden", String(!match));
    if (match) visible += 1;
  });

  elements.count.textContent = `${queryLower ? visible : elements.total} posts`;
  if (elements.pagination) {
    elements.pagination.classList.toggle("hidden", queryLower.length > 0);
  }
};

export const initPostSearch = () => {
  const elements = getElements();
  if (!elements) return;

  updateView(elements, elements.input.value);
  elements.input.addEventListener("input", () => {
    updateView(elements, elements.input.value);
  });
};
