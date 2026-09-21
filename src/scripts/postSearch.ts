import {
  onPageCleanup,
  onPageEvent,
  observePage,
} from "~/scripts/pageLifecycle";
import { normalizeSearchText, toTerms } from "~/utils/search";
import { filterTagSort } from "~/scripts/tagSortMode";

const REVEAL_CLASS = "is-search-revealed";

type FilterKind = "categories" | "tags" | "recordTypes";

const FILTER_KINDS = ["categories", "tags", "recordTypes"] as const;

const isFilterKind = (value: string | null | undefined): value is FilterKind =>
  FILTER_KINDS.includes(value as FilterKind);

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
const DESKTOP_FILTER_QUERY = "(min-width: 1280px)";
const FILTER_REVEAL_TOP_PX = 60;
// 簡易検索を閉じる動きの長さ。CSS の --duration-feedback と対で持つ
const FILTER_DOCK_CLOSE_MS = 160;

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
    inputClears: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-input-clear]"),
    ),
    resets: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-filter-reset]"),
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
    recordsMain: document.querySelector<HTMLElement>(".index-records-main"),
    desktopDock: document.querySelector<HTMLDetailsElement>(
      "[data-filter-dock-desktop]",
    ),
    dockTrigger: document.querySelector<HTMLButtonElement>(
      "[data-filter-dock-trigger]",
    ),
    dockLaunch: document.querySelector<HTMLElement>("[data-filter-launch]"),
    dockLaunchMin: document.querySelector<HTMLButtonElement>(
      "[data-filter-launch-min]",
    ),
    filterSheet: document.querySelector<HTMLDialogElement>(
      "[data-filter-sheet]",
    ),
    filterSheetClose: document.querySelector<HTMLButtonElement>(
      "[data-filter-sheet-close]",
    ),
    statusTerms: Array.from(
      document.querySelectorAll<HTMLElement>("[data-filter-status-term]"),
    ),
    statusCounts: Array.from(
      document.querySelectorAll<HTMLElement>("[data-filter-status-count]"),
    ),
    statusMetas: Array.from(
      document.querySelectorAll<HTMLElement>("[data-filter-status-meta]"),
    ),
    filterTriggerStatus: document.querySelector<HTMLElement>(
      "[data-filter-trigger-status]",
    ),
    filterSorts: Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-filter-sort]"),
    ),
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

  /*
   * scroll-behavior をこの要素へ残さない。残すとドラッグ中の scrollLeft の
   * 代入まで滑らかスクロール扱いになり、指に追従しなくなる
   */
  window_.scrollTo({
    left: slot.offsetLeft + slot.offsetWidth / 2 - window_.clientWidth / 2,
    behavior:
      prefersReducedMotion() ||
      document.documentElement.dataset.scroll === "instant"
        ? "instant"
        : behavior,
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
  let pointerId: number | null = null;
  let moved = 0;

  axis.addEventListener("pointerdown", (event) => {
    // 指とpenは既定の送りに任せる。奪うとsnapの慣性まで失う
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    pointerId = event.pointerId;
    moved = 0;
    startX = event.clientX;
    startLeft = axis.scrollLeft;
  });

  axis.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) return;

    const delta = event.clientX - startX;
    moved = Math.max(moved, Math.abs(delta));
    if (!dragging) {
      if (moved <= DRAG_CLICK_THRESHOLD_PX) return;
      // 押した瞬間に捕捉すると、年のリンクへclickが届かなくなる
      dragging = true;
      axis.style.scrollSnapType = "none";
      axis.setPointerCapture(event.pointerId);
      axis.dataset.dragging = "";
    }
    axis.scrollLeft = startLeft - delta;
  });

  const release = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
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

  onPageEvent(document, "pointerup", release);
  onPageEvent(document, "pointercancel", release);
  axis.addEventListener("lostpointercapture", release);

  // 送るつもりの操作が年の選択にならないようにする
  axis.addEventListener(
    "click",
    (event) => {
      if (moved > DRAG_CLICK_THRESHOLD_PX) {
        event.preventDefault();
        event.stopPropagation();
      }
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
    .filter((slot) => slotYear(slot) !== "")
    .reduce<{ slot: HTMLElement; distance: number } | null>((best, slot) => {
      const distance = Math.abs(
        slot.offsetLeft + slot.offsetWidth / 2 - center,
      );
      return !best || distance < best.distance ? { slot, distance } : best;
    }, null);

  return nearest ? slotYear(nearest.slot) : null;
};

/** 分野・タグ・自由入力・期間。すべて満たす記録だけを残す */
type Selection = {
  query: string;
  year: string;
  category: string;
  tag: string;
  recordType: string;
};

const hasTerm = (item: HTMLElement, kind: FilterKind, term: string) => {
  if (!term) return true;

  const terms: string[] = JSON.parse(item.dataset[kind] ?? "[]");
  const wanted = normalizeSearchText(term);
  return terms.some((value) => normalizeSearchText(value) === wanted);
};

const updateView = (
  elements: NonNullable<ReturnType<typeof getElements>>,
  selection: Selection,
) => {
  const { query, year, category, tag, recordType } = selection;
  // 分野・タグ・タイトルをまとめた検索テキストに対する AND 検索
  const terms = toTerms(query);
  let visible = 0;
  elements.items.forEach((item) => {
    const searchText = normalizeSearchText(item.dataset.searchText ?? "");
    /*
     * 分野とタグは完全一致で、自由入力は語の AND 検索で重ねる。
     * 種別の違う条件どうしも AND なので、絞るほど記録は減る
     */
    const match =
      terms.every((term) => searchText.includes(term)) &&
      hasTerm(item, "categories", category) &&
      hasTerm(item, "tags", tag) &&
      hasTerm(item, "recordTypes", recordType) &&
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

  const hasCondition =
    terms.length > 0 || Boolean(year || category || tag || recordType);
  // 一覧と同じ表記で見せる。タグは # を付け、自由入力は鉤括弧でくくる
  const conditions = [
    recordType,
    category,
    tag && `#${tag}`,
    query.trim() && `「${query.trim()}」`,
  ].filter((part): part is string => Boolean(part));
  if (elements.label) {
    const parts = year ? [`${year}年`, ...conditions] : conditions;
    elements.label.textContent = parts.join(" ・ ");
    elements.label.hidden = !hasCondition;
  }
  /*
   * 分野・タグの件数は、選ばれている期間の中の数へ入れ替える。検索語では動かさない。
   * 語で絞ると分野の一覧そのものが答えと重なり、数える意味が無くなる
   */
  const countsByKind: Record<FilterKind, Map<string, number>> = {
    categories: new Map<string, number>(),
    tags: new Map<string, number>(),
    recordTypes: new Map<string, number>(),
  };
  elements.items.forEach((item) => {
    if (year && item.dataset.year !== year) return;
    for (const kind of FILTER_KINDS) {
      const terms: string[] = JSON.parse(item.dataset[kind] ?? "[]");
      terms.forEach((term) => {
        const counts = countsByKind[kind];
        counts.set(term, (counts.get(term) ?? 0) + 1);
      });
    }
  });
  elements.terms.forEach((link) => {
    const count = link.querySelector<HTMLElement>("[data-term-count]");
    const term = link.dataset.filterTerm;
    const kind = link.dataset.filterKind;
    if (!count || !term || !isFilterKind(kind)) return;
    count.textContent = String(countsByKind[kind].get(term) ?? 0);
  });

  // 選択中の年・分野・タグ・型は一覧側でも色を変える
  const selectedByKind: Record<FilterKind, string> = {
    categories: category,
    tags: tag,
    recordTypes: recordType,
  };
  elements.terms.forEach((link) => {
    const kind = link.dataset.filterKind;
    const selected =
      isFilterKind(kind) && link.dataset.filterTerm === selectedByKind[kind];
    link.classList.toggle("is-selected", selected);
    if (selected) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
  elements.yearFilters.forEach((link) => {
    const selected = link.dataset.yearFilter === (year || "all");
    link.classList.toggle("is-selected", selected);
    if (selected) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  });
  markYearFocus(elements);
  elements.count.textContent = `${visible}件の記録`;
  if (elements.recordsMain) elements.recordsMain.hidden = visible === 0;
  if (conditions.length > 0) {
    /*
     * 選んだ条件を主役に置き、件数は結果の量として行の端へ、
     * 期間は条件を読む枠として下の行へ分ける
     */
    elements.statusTerms.forEach((element) => {
      element.textContent = conditions.join(" ・ ");
    });
    elements.statusCounts.forEach((element) => {
      element.textContent = `${visible}件`;
    });
    elements.statusMetas.forEach((element) => {
      element.textContent = year ? `${year}年` : "全期間";
    });
    if (elements.filterTriggerStatus)
      elements.filterTriggerStatus.textContent = [
        conditions.join(" ・ "),
        `${visible}件`,
      ].join(" ・ ");
  }
  if (elements.empty) elements.empty.hidden = !(hasCondition && visible === 0);
  // 入力欄の×は入力した語だけを消す。条件をまとめて外す操作とは分ける
  elements.inputClears.forEach((button) => {
    button.hidden = query.trim() === "";
  });
  elements.resets.forEach((button) => {
    button.hidden = !hasCondition;
  });
};

export const initPostSearch = () => {
  const elements = getElements();
  if (!elements) return;

  const params = new URL(window.location.href).searchParams;
  let selectedCategory = params.get("category") ?? "";
  let selectedTag = params.get("tag") ?? "";
  let selectedRecordType = params.get("type") ?? "";
  // 時系列順ページの年次導線から ?year= で渡された期間
  let selectedYear = params.get("year") ?? "";

  /*
   * 記事や外からのlinkは ?q= と ?kind= で来る。一覧にある分野・タグなら
   * その条件として受け取り、当てはまらない語は自由入力として扱う
   */
  const legacyQuery = params.get("q") ?? "";
  const legacyKind = params.get("kind");
  const knownLegacy =
    legacyQuery &&
    isFilterKind(legacyKind) &&
    elements.terms.some(
      (link) =>
        link.dataset.filterTerm === legacyQuery &&
        link.dataset.filterKind === legacyKind,
    );
  if (knownLegacy && legacyKind === "categories")
    selectedCategory = selectedCategory || legacyQuery;
  else if (knownLegacy && legacyKind === "tags")
    selectedTag = selectedTag || legacyQuery;
  else if (knownLegacy && legacyKind === "recordTypes")
    selectedRecordType = selectedRecordType || legacyQuery;
  else if (legacyQuery) elements.input.value = legacyQuery;

  let hasIndexQuery = false;
  let updateDock = () => {};

  const syncUrl = () => {
    const search = new URLSearchParams();
    const query = elements.input.value.trim();
    if (selectedCategory) search.set("category", selectedCategory);
    if (selectedTag) search.set("tag", selectedTag);
    if (selectedRecordType) search.set("type", selectedRecordType);
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
    updateView(elements, {
      query: elements.input.value,
      year: selectedYear,
      category: selectedCategory,
      tag: selectedTag,
      recordType: selectedRecordType,
    });
    // 簡易検索は分野・タグ・型で絞っているときの入口。自由入力だけでは出さない
    hasIndexQuery = Boolean(
      selectedCategory || selectedTag || selectedRecordType,
    );
    updateDock();
    syncUrl();
  };

  const tagNav = document.querySelector<HTMLElement>("[data-tag-nav]");
  const desktopFilter = window.matchMedia(DESKTOP_FILTER_QUERY);
  const restoreIndexFocus = (scope: HTMLElement) => {
    if (!scope.contains(document.activeElement)) return;

    const active = document.activeElement as HTMLElement;
    const activeLink = active.closest<HTMLElement>("[data-filter-term]");
    const term = activeLink?.dataset.filterTerm;
    const kind = activeLink?.dataset.filterKind;
    const replacement = elements.terms.find(
      (link) =>
        !link.closest("[data-filter-dock-desktop], [data-filter-sheet]") &&
        link.dataset.filterTerm === term &&
        link.dataset.filterKind === kind,
    );
    if (replacement) replacement.focus({ preventScroll: true });
    else active.blur();
  };

  if (
    tagNav &&
    elements.desktopDock &&
    elements.dockTrigger &&
    elements.dockLaunch &&
    elements.dockLaunchMin &&
    elements.filterSheet
  ) {
    const desktopDock = elements.desktopDock;
    const trigger = elements.dockTrigger;
    const launch = elements.dockLaunch;
    const launchMin = elements.dockLaunchMin;
    const sheet = elements.filterSheet;

    /*
     * 面は3段階で畳む。一覧つき → 見出しと今の条件だけ → 開く印だけ。
     * 読むほうへ場所を返しても、絞り込みへ戻る入口は画面に残す
     */
    const dockSummary = desktopDock.querySelector("summary");
    let dockCloseTimer = 0;
    const setDockState = (state: "open" | "status" | "mark") => {
      desktopDock.dataset.state = state;
      desktopDock.open = state === "open";
      if (state === "mark") dockSummary?.setAttribute("aria-label", "簡易検索");
      else dockSummary?.removeAttribute("aria-label");
    };
    // 閉じる動きを見せてから open を外す。中身が消える前に同じ分だけ戻す
    const finishDockClosing = () => {
      window.clearTimeout(dockCloseTimer);
      delete desktopDock.dataset.closing;
      setDockState("status");
    };
    const closeDesktopDock = () => {
      if (!desktopDock.open || desktopDock.dataset.closing !== undefined)
        return;

      if (prefersReducedMotion()) {
        finishDockClosing();
        return;
      }

      desktopDock.dataset.closing = "";
      dockCloseTimer = window.setTimeout(
        finishDockClosing,
        FILTER_DOCK_CLOSE_MS,
      );
    };
    dockSummary?.addEventListener("click", (event) => {
      event.preventDefault();
      const state = desktopDock.dataset.state;
      if (state === "status") setDockState("mark");
      else if (state === "mark") setDockState("open");
      else closeDesktopDock();
    });
    onPageCleanup(() => window.clearTimeout(dockCloseTimer));
    setDockState("open");

    updateDock = () => {
      const visible = hasIndexQuery && window.scrollY >= FILTER_REVEAL_TOP_PX;
      const desktop = desktopFilter.matches;

      if (!visible || !desktop) {
        restoreIndexFocus(desktopDock);
        // 隠すときは動きを見せる相手がいないので、閉じかけの状態を持ち越さない
        if (desktopDock.dataset.closing !== undefined) finishDockClosing();
        desktopDock.hidden = true;
      } else {
        desktopDock.hidden = false;
      }

      if (!visible || desktop) {
        if (sheet.open) sheet.close();
        launch.hidden = true;
      } else {
        launch.hidden = false;
      }
    };

    const observer = new IntersectionObserver(updateDock, {
      rootMargin: `-${FILTER_REVEAL_TOP_PX}px 0px 0px 0px`,
    });
    observer.observe(tagNav);
    onPageCleanup(() => observer.disconnect());

    let dockFrame = 0;
    const onPageScroll = () => {
      if (dockFrame) return;
      dockFrame = requestAnimationFrame(() => {
        dockFrame = 0;
        updateDock();
      });
    };
    window.addEventListener("scroll", onPageScroll, { passive: true });
    onPageCleanup(() => {
      window.removeEventListener("scroll", onPageScroll);
      if (dockFrame) cancelAnimationFrame(dockFrame);
    });

    const onDesktopChange = () => updateDock();
    desktopFilter.addEventListener("change", onDesktopChange);
    onPageCleanup(() =>
      desktopFilter.removeEventListener("change", onDesktopChange),
    );

    trigger.addEventListener("click", () => {
      if (!sheet.open) sheet.showModal();
    });

    // 呼び出しの面も畳める。記録を読むあいだ、開く印だけを残す
    launchMin.addEventListener("click", () => {
      const minimized = launch.dataset.min !== undefined;
      if (minimized) delete launch.dataset.min;
      else launch.dataset.min = "";
      launchMin.setAttribute(
        "aria-label",
        minimized ? "簡易検索を最小化" : "簡易検索を開く",
      );
    });
    elements.filterSheetClose?.addEventListener("click", () => sheet.close());
    sheet.addEventListener("click", (event) => {
      if (event.target === sheet) sheet.close();
    });
    sheet.addEventListener("close", () => {
      if (launch.hidden) return;
      const back = launch.dataset.min !== undefined ? launchMin : trigger;
      back.focus({ preventScroll: true });
    });
  }

  // 簡易検索の中のタグの並び。panelとsheetは同じ面なので状態を共有する
  const renderSort = (alpha: boolean) => {
    elements.filterSorts.forEach((button) => {
      button.setAttribute("aria-pressed", String(alpha));
      button
        .closest("[data-filter-dock-desktop], [data-filter-sheet]")
        ?.classList.toggle("is-alpha", alpha);
    });
  };
  elements.filterSorts.forEach((button) =>
    button.addEventListener("click", () =>
      filterTagSort.setAlpha(!filterTagSort.isAlpha()),
    ),
  );
  onPageCleanup(filterTagSort.onChange(renderSort));
  renderSort(filterTagSort.isAlpha());

  // 分野・タグ・型・自由入力・期間をまとめて外す
  const resetAll = () => {
    elements.input.value = "";
    selectedYear = "";
    selectedCategory = "";
    selectedTag = "";
    selectedRecordType = "";
    apply();
    centerYearSlot(elements, selectedYear, "smooth");
  };

  const clear = () => {
    resetAll();
    elements.input.focus();
  };

  [...elements.items, ...elements.groups, ...elements.years].forEach(
    (element) => element.addEventListener("animationend", clearReveal),
  );

  apply();

  if (elements.yearWindow) {
    const axis = elements.yearWindow;
    centerYearSlot(elements, selectedYear, "instant");
    markYearFocus(elements);
    enableYearDrag(elements);
    /*
     * 幅が変わると中央の位置がずれる。選択はそのままに位置だけ合わせ直す。
     * 幅が変わっていないときは合わせ直さない。絞り込みで一覧の高さが変わる
     * たびに発火し、始まったばかりの送りを打ち消してしまう
     */
    let axisWidth = axis.clientWidth;
    observePage(
      new ResizeObserver(() => {
        if (axis.clientWidth === axisWidth) return;

        axisWidth = axis.clientWidth;
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
      if (axis.hasAttribute("data-dragging")) return;

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
  /*
   * 他のページの導線から絞り込んだ状態で来たときは、着地時点で一覧を見せる。
   * 年でも分野・タグでも扱いは同じにする
   */
  if (
    (selectedYear || selectedCategory || selectedTag || elements.input.value) &&
    elements.list
  ) {
    const list = elements.list;
    requestAnimationFrame(() => scrollToRecords(list, true));
  }

  elements.input.addEventListener("input", () => {
    apply();
  });
  // 手入力後に検索欄を離れたときも、SP なら結果まで送る
  elements.input.addEventListener("blur", (event) => {
    if (!isSmallScreen() || !elements.list) return;
    if (!elements.input.value.trim()) return;
    const next = event.relatedTarget;
    // 条件を外す操作でフォーカスが移った場合は送らない
    if (
      next instanceof HTMLElement &&
      next.closest("[data-input-clear], [data-filter-reset]")
    )
      return;
    scrollToRecords(elements.list);
  });
  elements.resets.forEach((button) =>
    button.addEventListener("click", () => {
      /*
       * 簡易検索から外したときは検索欄へフォーカスを戻さず、
       * 元に戻った一覧の先頭へ送る
       */
      const fromFilter = Boolean(
        button.closest("[data-filter-dock-desktop], [data-filter-sheet]"),
      );
      if (fromFilter && elements.filterSheet?.open)
        elements.filterSheet.close();
      resetAll();
      if (fromFilter)
        elements.list
          ?.querySelector<HTMLElement>("[data-record-link]")
          ?.focus({ preventScroll: true });
      else elements.input.focus();
    }),
  );
  // 入力欄の×は語を消すだけ。分野・タグ・期間はそのまま残す
  elements.inputClears.forEach((button) =>
    button.addEventListener("click", () => {
      elements.input.value = "";
      apply();
      elements.input.focus();
    }),
  );
  /*
   * bottom sheet は選んでも閉じない。軸が4つあり、続けて選びたいことのほうが
   * 多いため、閉じる判断は読者へ預ける。一覧の先頭へ送るのは閉じたあと
   */
  let sheetScrollPending = false;
  elements.filterSheet?.addEventListener("close", () => {
    if (!sheetScrollPending) return;

    sheetScrollPending = false;
    if (elements.list) scrollToRecords(elements.list);
  });
  // 探すページ内の型・分野・タグは、遷移せず検索語として検索窓へ入れる
  elements.terms.forEach((link) => {
    link.addEventListener("click", (event) => {
      const term = link.dataset.filterTerm;
      const kind = link.dataset.filterKind;
      if (
        !term ||
        !isFilterKind(kind) ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      )
        return;
      event.preventDefault();
      const fromDesktopDock = Boolean(
        link.closest("[data-filter-dock-desktop]"),
      );
      const fromSheet = Boolean(link.closest("[data-filter-sheet]"));
      // 同じ項目をもう一度押したらその条件だけ外す。他の条件は残す
      const current =
        kind === "categories"
          ? selectedCategory
          : kind === "tags"
            ? selectedTag
            : selectedRecordType;
      const selected = current === term;
      const next = selected ? "" : term;
      if (kind === "categories") selectedCategory = next;
      else if (kind === "tags") selectedTag = next;
      else selectedRecordType = next;
      if (!fromDesktopDock && !fromSheet && desktopFilter.matches) {
        if (elements.desktopDock) elements.desktopDock.open = true;
      }
      apply();
      // 送るのは絞り込んだときだけ。解除は記録が戻る側なので、読んでいた位置を動かさない
      if (selected) return;
      if (fromSheet) sheetScrollPending = true;
      else if (elements.list) scrollToRecords(elements.list);
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
    // 探すページでも Cmd / Ctrl+F はこのページの検索へ回す。記事ページと揃える
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
