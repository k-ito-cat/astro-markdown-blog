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

// 検索欄の下にタグ一覧が続き記録が見えないので、一覧の先頭まで送る
const scrollToRecords = (list: HTMLElement, instant = false) => {
  list.scrollIntoView({
    behavior: instant || prefersReducedMotion() ? "instant" : "smooth",
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
    label: document.querySelector<HTMLElement>("[data-search-label]"),
    clears: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-search-clear]"),
    ),
    terms: Array.from(
      document.querySelectorAll<HTMLAnchorElement>("[data-filter-term]"),
    ),
    yearFilters: Array.from(
      document.querySelectorAll<HTMLAnchorElement>("[data-year-filter]"),
    ),
    yearTrack: document.querySelector<HTMLElement>("[data-year-track]"),
    yearsNav: document.querySelector<HTMLElement>("[data-years]"),
    yearToggle: document.querySelector<HTMLButtonElement>("[data-year-toggle]"),
    list: document.querySelector<HTMLElement>("[data-record-list]"),
    total: Number(count.dataset.total ?? "0"),
  };
};

// 選んだ年（未選択なら最新年）が窓の右寄りに来るよう軌道を滑らせる。
// 窓には過去2年ぶんが残り、ひとつ新しい年は右に小さく覗く
const slideYearAxis = (
  elements: NonNullable<ReturnType<typeof getElements>>,
  year: string,
) => {
  const track = elements.yearTrack;
  if (!track) return;
  const slots = Array.from(track.children) as HTMLElement[];
  const focusIndex = year
    ? slots.findIndex((slot) =>
        slot.querySelector(`[data-year-filter="${year}"]`),
      )
    : slots.length - 1;
  if (focusIndex < 0) return;

  slots.forEach((slot, index) => {
    slot.classList.toggle("is-focus", index === focusIndex);
    // 右に見せるのは1年ぶんだけ。それより先は枠だけ残して隠す
    slot.classList.toggle("is-ahead", index === focusIndex + 1);
    slot.classList.toggle("is-beyond", index > focusIndex + 1);
  });

  // 枠ごとに間隔が違うので、位置は数え上げではなく実測で合わせる
  const focus = slots[focusIndex];
  const view = track.parentElement;
  if (!focus || !view) return;
  const shift =
    view.clientWidth / 2 - (focus.offsetLeft + focus.offsetWidth / 2);
  track.style.translate = `${shift}px 0`;
};

const updateView = (
  elements: NonNullable<ReturnType<typeof getElements>>,
  query: string,
  year: string,
) => {
  // 分野・タグ・タイトルをまとめた検索テキストに対する AND 検索
  const terms = toTerms(query);
  let visible = 0;
  elements.items.forEach((item) => {
    const searchText = normalize(item.dataset.searchText ?? "");
    // 語の AND 検索と、選んだ年での期間絞り込みを重ねる
    const match =
      terms.every((term) => searchText.includes(term)) &&
      (!year || item.dataset.year === year);
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
  let firstVisibleYear: HTMLElement | null = null;
  elements.years.forEach((year) => {
    let next = year.nextElementSibling;
    let visibleInYear = 0;
    while (next && !next.matches("[data-year-group]")) {
      if (next.matches("[data-record-entry]:not([hidden])")) visibleInYear += 1;
      next = next.nextElementSibling;
    }
    const hasVisibleItem = visibleInYear > 0;

    // 件数は、絞り込み中はその年の該当数、条件が無ければ総数を出す
    const count = year.querySelector<HTMLElement>("[data-year-count]");
    if (count)
      count.textContent = `${terms.length > 0 || year ? visibleInYear : (count.dataset.total ?? "0")}件`;

    const wasHidden = year.hidden;
    year.hidden = !hasVisibleItem;
    if (hasVisibleItem) {
      if (!firstVisibleYear) firstVisibleYear = year;
      if (wasHidden) reveal(year);
    }
  });
  elements.years.forEach((year) => {
    year.classList.toggle("is-first-visible", year === firstVisibleYear);
  });

  const hasCondition = terms.length > 0 || Boolean(year);
  // 分野・タグと完全一致する語なら、一覧と同じ表記（#付きなど）で見せる
  const raw = query.trim();
  const matched = elements.terms.find(
    (link) => link.dataset.filterTerm === raw,
  );
  if (elements.label) {
    const parts = [];
    if (year) parts.push(`${year}年`);
    if (raw) parts.push(matched?.querySelector("span")?.textContent ?? raw);
    elements.label.textContent = parts.join(" ・ ");
    elements.label.hidden = !hasCondition;
  }
  // 選択中の年・分野・タグは一覧側でも色を変える
  elements.terms.forEach((link) => {
    link.classList.toggle("is-selected", link === matched);
  });
  elements.yearFilters.forEach((link) => {
    link.classList.toggle(
      "is-selected",
      link.dataset.yearFilter === (year || "all"),
    );
  });
  slideYearAxis(elements, year);
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
  // 時系列順ページの年次導線から ?year= で渡された期間
  let selectedYear = params.get("year") ?? "";

  const syncUrl = () => {
    const search = new URLSearchParams();
    const query = elements.input.value.trim();
    if (query) search.set("q", query);
    if (selectedYear) search.set("year", selectedYear);
    const rest = search.toString();
    window.history.replaceState(null, "", rest ? `/blog?${rest}` : "/blog");
  };

  // 全期間のときは年次を伏せ、「期間で絞る」で開いて年を選ぶ
  let axisOpen = Boolean(selectedYear);
  const renderAxis = () => {
    elements.yearsNav?.classList.toggle("is-closed", !axisOpen);
    if (!elements.yearToggle) return;
    elements.yearToggle.textContent = axisOpen ? "全期間" : "期間で絞る";
    elements.yearToggle.setAttribute("aria-expanded", String(axisOpen));
  };

  const apply = () => {
    updateView(elements, elements.input.value, selectedYear);
    renderAxis();
    syncUrl();
  };

  const clear = () => {
    elements.input.value = "";
    selectedYear = "";
    axisOpen = false;
    apply();
    elements.input.focus();
  };

  [...elements.items, ...elements.groups, ...elements.years].forEach(
    (element) => element.addEventListener("animationend", clearReveal),
  );

  updateView(elements, elements.input.value, selectedYear);
  renderAxis();
  if (initialQuery || selectedYear) syncUrl();
  if (elements.yearTrack)
    new ResizeObserver(() => slideYearAxis(elements, selectedYear)).observe(
      elements.yearTrack.parentElement ?? elements.yearTrack,
    );
  // 時系列順ページの年次導線から来たときは、着地時点で一覧を見せる
  if (selectedYear && elements.list) {
    const list = elements.list;
    requestAnimationFrame(() => scrollToRecords(list, true));
  }

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
      if (elements.list) scrollToRecords(elements.list);
      // SP でフォーカスするとソフトキーボードが出て一覧が潰れるため送りだけ行う
      // PC は入力欄に戻すが、送りと取り合わないようスクロールは伴わせない
      if (!isSmallScreen()) elements.input.focus({ preventScroll: true });
    });
  });
  elements.yearToggle?.addEventListener("click", () => {
    if (axisOpen) selectedYear = "";
    axisOpen = !axisOpen;
    apply();
  });
  elements.yearFilters.forEach((link) => {
    link.addEventListener("click", (event) => {
      const year = link.dataset.yearFilter;
      if (!year || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      // 「全期間」は解除、同じ年をもう一度押した場合も解除
      // 年の軸は現在地が動くと混乱するので、一覧への送りは行わない
      selectedYear = year === "all" || selectedYear === year ? "" : year;
      apply();
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
