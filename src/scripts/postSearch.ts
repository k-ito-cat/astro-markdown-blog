import { onPageEvent, observePage } from "~/scripts/pageLifecycle";
import {
  findOccurrences,
  paintHighlight,
  toRange,
} from "~/scripts/searchHighlight";
import { normalizeSearchText, toTerms } from "~/utils/search";

/** 残った記録のうち、当たった語を塗る */
const HIGHLIGHT_HITS = "post-search";

const REVEAL_CLASS = "is-search-revealed";

// scrollend が無い環境で、送りが止まったとみなすまでの待ち
const SCROLL_SETTLE_MS = 150;

// これ以上動かしたら、clickではなく送りの操作だったとみなす
const DRAG_CLICK_THRESHOLD_PX = 4;

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
    yearWindow: document.querySelector<HTMLElement>("[data-year-window]"),
    list: document.querySelector<HTMLElement>("[data-record-list]"),
    total: Number(count.dataset.total ?? "0"),
  };
};

const yearSlots = (elements: NonNullable<ReturnType<typeof getElements>>) =>
  Array.from(elements.yearTrack?.children ?? []) as HTMLElement[];

const slotYear = (slot: HTMLElement) =>
  slot.querySelector<HTMLElement>("[data-year-filter]")?.dataset.yearFilter ??
  "";

/*
 * いま中央にある枠を大きく見せ、そこより新しい側は1年だけ覗かせる。
 * 選択（絞り込み）とは別で、送っている最中の見た目だけを扱う。
 * 中央が動けばマスクも動くので、送るほど先の年が現れる
 */
const markYearFocus = (
  elements: NonNullable<ReturnType<typeof getElements>>,
) => {
  const axis = elements.yearWindow;
  if (!axis) return;

  // 0 件の年は data-year-filter を持たないので、枠の種類で選ぶ
  const slots = yearSlots(elements).filter(
    (slot) => !slot.classList.contains("axis-pad"),
  );
  const center = axis.scrollLeft + axis.clientWidth / 2;
  const distanceTo = (slot: HTMLElement) =>
    Math.abs(slot.offsetLeft + slot.offsetWidth / 2 - center);
  const focusIndex = slots.reduce(
    (best, slot, index) =>
      distanceTo(slot) < distanceTo(slots[best]) ? index : best,
    0,
  );

  slots.forEach((slot, index) => {
    slot.classList.toggle("is-focus", index === focusIndex);
    slot.classList.toggle("is-ahead", index === focusIndex + 1);
    slot.classList.toggle("is-beyond", index > focusIndex + 1);
  });
};

// clickや初期表示など、読者の送り以外で選択が変わったときだけ中央へ寄せる
const centerYearSlot = (
  elements: NonNullable<ReturnType<typeof getElements>>,
  year: string,
  behavior: ScrollBehavior,
) => {
  const window_ = elements.yearWindow;
  const slot = yearSlots(elements).find(
    (candidate) => slotYear(candidate) === (year || "all"),
  );
  if (!window_ || !slot) return;

  window_.scrollTo({
    left: slot.offsetLeft + slot.offsetWidth / 2 - window_.clientWidth / 2,
    behavior,
  });
};

/*
 * マウスでも指と同じように掴んで送れるようにする。PCにはtouchの送りが無く、
 * 縦のhome wheelでは横へ動かないため、送りの入口がscrollbarだけになる。
 * clickとKeyboardからも同じ選択へ到達できるので、gestureは近道として足す
 */
const enableYearDrag = (
  elements: NonNullable<ReturnType<typeof getElements>>,
) => {
  const axis = elements.yearWindow;
  if (!axis) return;

  let startX = 0;
  let startLeft = 0;
  let dragging = false;
  let moved = 0;

  axis.addEventListener("pointerdown", (event) => {
    // 指とpenは既定の送りに任せる。奪うとsnapの慣性まで失う
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    dragging = true;
    moved = 0;
    startX = event.clientX;
    startLeft = axis.scrollLeft;
    // 掴んでいる間は吸着を外す。効かせたままだと指の動きに付いてこない
    axis.style.scrollSnapType = "none";
    axis.setPointerCapture(event.pointerId);
    axis.dataset.dragging = "";
  });

  axis.addEventListener("pointermove", (event) => {
    if (!dragging) return;

    const delta = event.clientX - startX;
    moved = Math.max(moved, Math.abs(delta));
    axis.scrollLeft = startLeft - delta;
  });

  const release = (event: PointerEvent) => {
    if (!dragging) return;

    dragging = false;
    delete axis.dataset.dragging;
    axis.style.scrollSnapType = "";
    if (axis.hasPointerCapture(event.pointerId))
      axis.releasePointerCapture(event.pointerId);

    // 吸着を戻しただけでは止まった位置に留まるので、近い枠まで送る
    const year = snappedYear(elements);
    if (year !== null) centerYearSlot(elements, year, "smooth");
  };

  axis.addEventListener("pointerup", release);
  axis.addEventListener("pointercancel", release);

  // 送るつもりの操作が年の選択にならないようにする
  axis.addEventListener(
    "click",
    (event) => {
      if (moved > DRAG_CLICK_THRESHOLD_PX) event.stopPropagation();
      moved = 0;
    },
    { capture: true },
  );
};

// 中央に最も近い枠を、いま選ばれている期間として読む
const snappedYear = (elements: NonNullable<ReturnType<typeof getElements>>) => {
  const window_ = elements.yearWindow;
  if (!window_) return null;

  const center = window_.scrollLeft + window_.clientWidth / 2;
  const nearest = yearSlots(elements)
    // 0 件の年と端の余白は吸着しないので、選択の候補から外す
    .filter(
      (slot) =>
        slotYear(slot) !== "" && !slot.classList.contains("is-unsnapped"),
    )
    .reduce<{ slot: HTMLElement; distance: number } | null>((best, slot) => {
      const distance = Math.abs(
        slot.offsetLeft + slot.offsetWidth / 2 - center,
      );
      return !best || distance < best.distance ? { slot, distance } : best;
    }, null);

  return nearest ? slotYear(nearest.slot) : null;
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
    const searchText = normalizeSearchText(item.dataset.searchText ?? "");
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
    const selected = link.dataset.yearFilter === (year || "all");
    link.classList.toggle("is-selected", selected);
    if (selected) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
  markYearFocus(elements);
  /*
   * 残った記録の中で、当たった語を塗る。絞り込みの突き合わせは NFKC を掛けて
   * いるが、NFKC は文字数を変えるのでその位置は使えない。ここは元のテキストを
   * 小文字にして拾い直す。表記が違えば塗られないだけで、絞り込みには響かない
   */
  paintHighlight(
    HIGHLIGHT_HITS,
    elements.items
      .filter((item) => !item.hidden)
      .flatMap((item) => findOccurrences(item, query).map(toRange)),
  );
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
    window.history.replaceState(
      window.history.state,
      "",
      rest ? `/blog?${rest}` : "/blog",
    );
  };

  const apply = () => {
    updateView(elements, elements.input.value, selectedYear);
    syncUrl();
  };

  const clear = () => {
    elements.input.value = "";
    selectedYear = "";
    apply();
    centerYearSlot(elements, selectedYear, "smooth");
    elements.input.focus();
  };

  [...elements.items, ...elements.groups, ...elements.years].forEach(
    (element) => element.addEventListener("animationend", clearReveal),
  );

  updateView(elements, elements.input.value, selectedYear);
  if (initialQuery || selectedYear) syncUrl();

  if (elements.yearWindow) {
    const axis = elements.yearWindow;
    centerYearSlot(elements, selectedYear, "instant");
    markYearFocus(elements);
    enableYearDrag(elements);
    // 幅が変わると中央の位置がずれる。選択はそのままに位置だけ合わせ直す
    observePage(
      new ResizeObserver(() => {
        centerYearSlot(elements, selectedYear, "instant");
        markYearFocus(elements);
      }),
    ).observe(axis);

    // 見た目は送りに追従させる。絞り込みは止まってから
    let pending = 0;
    axis.addEventListener(
      "scroll",
      () => {
        if (pending) return;
        pending = requestAnimationFrame(() => {
          pending = 0;
          markYearFocus(elements);
        });
      },
      { passive: true },
    );

    // 送りが落ち着いた時点の枠を選択として読む。途中の枠では絞り込まない
    const settle = () => {
      const year = snappedYear(elements);
      if (year === null) return;

      const next = year === "all" ? "" : year;
      if (next === selectedYear) return;

      selectedYear = next;
      apply();
    };

    if ("onscrollend" in window) {
      axis.addEventListener("scrollend", settle);
    } else {
      // scrollend 未対応（Safari 18.2 未満）。止まってから同じ判定を行う
      let timer = 0;
      axis.addEventListener(
        "scroll",
        () => {
          window.clearTimeout(timer);
          timer = window.setTimeout(settle, SCROLL_SETTLE_MS);
        },
        { passive: true },
      );
    }
  }
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
  elements.yearFilters.forEach((link) => {
    link.addEventListener("click", (event) => {
      const year = link.dataset.yearFilter;
      if (!year || event.metaKey || event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      // 「全期間」は解除、同じ年をもう一度押した場合も解除
      // 年の軸は現在地が動くと混乱するので、一覧への送りは行わない
      selectedYear = year === "all" || selectedYear === year ? "" : year;
      apply();
      centerYearSlot(elements, selectedYear, "smooth");
    });
  });
  const focusSearch = () => {
    elements.input.focus();
    elements.input.select();
  };

  onPageEvent(document, "keydown", (event) => {
    // 索引でも Cmd / Ctrl+F はこのページの検索へ回す。記事ページと揃える
    if (event.key === "f" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      focusSearch();
      return;
    }

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
      focusSearch();
    }
    if (
      event.key === "Escape" &&
      document.activeElement === elements.input &&
      elements.input.value
    )
      clear();
  });
};
