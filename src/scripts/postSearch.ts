const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja");

const toTerms = (query: string) =>
  normalize(query).split(/\s+/u).filter(Boolean);

const REVEAL_CLASS = "is-search-revealed";

// 非表示から表示に変わった要素にだけ、ごく短いフェードを掛ける
const reveal = (element: HTMLElement) => {
  element.classList.remove(REVEAL_CLASS);
  element.classList.add(REVEAL_CLASS);
};

const clearReveal = (event: AnimationEvent) => {
  if (event.target instanceof HTMLElement)
    event.target.classList.remove(REVEAL_CLASS);
};

const SP_QUERY = "(max-width: 639px)";

const isSmallScreen = () => window.matchMedia(SP_QUERY).matches;

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// SP では検索欄の下にタグ一覧が続き記録が見えないので、一覧の先頭まで送る
const scrollToRecords = (list: HTMLElement) => {
  list.scrollIntoView({
    behavior: prefersReducedMotion() ? "instant" : "smooth",
    block: "start",
  });
};

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
    years: Array.from(
      document.querySelectorAll<HTMLElement>("[data-year-group]"),
    ),
    empty: document.querySelector<HTMLElement>("[data-search-empty]"),
    clears: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-search-clear]"),
    ),
    terms: Array.from(
      document.querySelectorAll<HTMLAnchorElement>("[data-filter-term]"),
    ),
    list: document.querySelector<HTMLElement>("[data-record-list]"),
    total: Number(count.dataset.total ?? "0"),
  };
};

const updateView = (
  elements: NonNullable<ReturnType<typeof getElements>>,
  query: string,
) => {
  // 分野・タグ・タイトルをまとめた検索テキストに対する AND 検索
  const terms = toTerms(query);
  let visible = 0;
  elements.items.forEach((item) => {
    const searchText = normalize(item.dataset.searchText ?? "");
    const match = terms.every((term) => searchText.includes(term));
    const wasHidden = item.hidden;
    item.hidden = !match;
    if (match) {
      visible += 1;
      if (wasHidden) reveal(item);
    }
  });

  elements.groups.forEach((group) => {
    let next = group.nextElementSibling;
    let hasVisibleItem = false;
    while (next && !next.matches("[data-date-group]")) {
      if (next.matches("[data-record-entry]:not([hidden])"))
        hasVisibleItem = true;
      next = next.nextElementSibling;
    }
    const wasHidden = group.hidden;
    group.hidden = !hasVisibleItem;
    if (hasVisibleItem && wasHidden) reveal(group);
  });

  // 年の断層線は、その年に表示中の記録が1件も無ければ隠す
  elements.years.forEach((year) => {
    let next = year.nextElementSibling;
    let hasVisibleItem = false;
    while (next && !next.matches("[data-year-group]")) {
      if (next.matches("[data-record-entry]:not([hidden])"))
        hasVisibleItem = true;
      next = next.nextElementSibling;
    }
    const wasHidden = year.hidden;
    year.hidden = !hasVisibleItem;
    if (hasVisibleItem && wasHidden) reveal(year);
  });

  const hasCondition = terms.length > 0;
  elements.count.textContent = `${hasCondition ? visible : elements.total}件の記録`;
  if (elements.empty) elements.empty.hidden = !(hasCondition && visible === 0);
  elements.clears.forEach((button) => {
    button.hidden = !hasCondition;
  });
};

export const initPostSearch = () => {
  const elements = getElements();
  if (!elements) return;

  const params = new URL(window.location.href).searchParams;
  // 記事詳細などから ?q= で渡された分野・タグをそのまま検索語として扱う
  const initialQuery = params.get("q");
  if (initialQuery) elements.input.value = initialQuery;

  const syncUrl = () => {
    const query = elements.input.value.trim();
    window.history.replaceState(
      null,
      "",
      query ? `/blog?q=${encodeURIComponent(query)}` : "/blog",
    );
  };

  const apply = () => {
    updateView(elements, elements.input.value);
    syncUrl();
  };

  const clear = () => {
    elements.input.value = "";
    apply();
    elements.input.focus();
  };

  [...elements.items, ...elements.groups, ...elements.years].forEach(
    (element) => element.addEventListener("animationend", clearReveal),
  );

  updateView(elements, elements.input.value);
  if (initialQuery) syncUrl();

  elements.input.addEventListener("input", apply);
  // 手入力後に検索欄を離れたときも、SP なら結果まで送る
  elements.input.addEventListener("blur", (event) => {
    if (!isSmallScreen() || !elements.list) return;
    if (!elements.input.value.trim()) return;
    const next = event.relatedTarget;
    // 条件を外す操作でフォーカスが移った場合は送らない
    if (next instanceof HTMLElement && next.closest("[data-search-clear]"))
      return;
    scrollToRecords(elements.list);
  });
  elements.clears.forEach((button) => button.addEventListener("click", clear));
  // 索引ページ内の分野・タグは、遷移せず検索語として検索窓へ入れる
  elements.terms.forEach((link) => {
    link.addEventListener("click", (event) => {
      const term = link.dataset.filterTerm;
      if (!term || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      elements.input.value = term;
      apply();
      // SP でフォーカスするとソフトキーボードが出て一覧が潰れるため送りだけ行う
      if (isSmallScreen()) {
        if (elements.list) scrollToRecords(elements.list);
        return;
      }
      elements.input.focus();
    });
  });
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
