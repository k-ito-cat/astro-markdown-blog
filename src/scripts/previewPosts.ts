import {
  POST_PRIORITY,
  POST_PRIORITY_LABELS,
  POST_PRIORITY_ORDER,
  type PostPriority,
} from "~/constants/postPriority";
import {
  PUBLISHED_STATUS,
  PUBLISHED_STATUS_LABELS,
  PUBLISHED_STATUS_ORDER,
  type PublishedStatus,
} from "~/constants/publishedStatus";
import {
  WRITING_STATUS,
  WRITING_STATUS_LABELS,
  WRITING_STATUS_ORDER,
  type WritingStatus,
} from "~/constants/writingStatus";
import {
  normalizeSearchText,
  MEMO_STATE_LABELS,
  MEMO_STATE_ORDER,
  type MemoState,
} from "~/utils/previewPost";
import { initPreviewInlineEdit } from "~/scripts/previewInlineEdit";

type GroupName = "priority" | "writing" | "publication" | "none";
type SortColumn =
  | "title"
  | "priority"
  | "writing"
  | "publication"
  | "memo"
  | "updated";
type SortDirection = "asc" | "desc";
type SortName = "recommended" | `${SortColumn}-${SortDirection}`;
type FilterKey =
  | "priority"
  | "writing"
  | "publication"
  | "memo"
  | "category"
  | "tag";

type PreviewState = {
  query: string;
  group: GroupName;
  sort: SortName;
  priority: PostPriority[];
  writing: WritingStatus[];
  publication: PublishedStatus[];
  memo: MemoState[];
  category: string[];
  tag: string[];
  recentDays: number;
};

type PreviewRow = {
  element: HTMLTableRowElement;
  title: string;
  search: string;
  pinned: boolean;
  priority: PostPriority;
  writing: WritingStatus;
  publication: PublishedStatus;
  memo: MemoState;
  categories: string[];
  tags: string[];
  published: string;
  updated: number;
};

type GroupDefinition = {
  value: string;
  label: string;
};

const GROUP_NAMES = ["priority", "writing", "publication", "none"] as const;
/** 並び替えやグループ分けより前に、常に最上部へ出す塊。見出しは持たない */
const PINNED_GROUP: GroupDefinition = { value: "pinned", label: "" };
const SORT_COLUMNS = [
  "title",
  "priority",
  "writing",
  "publication",
  "memo",
  "updated",
] as const;
const DEFAULT_SORT_DIRECTION: Record<SortColumn, SortDirection> = {
  title: "asc",
  priority: "asc",
  writing: "asc",
  publication: "asc",
  memo: "asc",
  updated: "desc",
};
const TABLE_COLUMN_COUNT = SORT_COLUMNS.length;
const MEMO_STATES = [
  "HAS_MEMO",
  "EMPTY_MEMO",
  "NO_MEMO",
  "BROKEN_MEMO",
] as const;

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getRecentCutoff = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return formatLocalDate(date);
};

const createBaseState = (): PreviewState => ({
  query: "",
  group: "none",
  sort: "recommended",
  priority: [],
  writing: [],
  publication: [],
  memo: [],
  category: [],
  tag: [],
  recentDays: 0,
});

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

const getRow = (element: HTMLTableRowElement): PreviewRow => {
  const priority = element.dataset.priority as PostPriority;
  const writing = element.dataset.writing as WritingStatus;
  const publication = element.dataset.publication as PublishedStatus;
  const memo = element.dataset.memo as MemoState;
  const updated = Date.parse(element.dataset.updated ?? "");

  if (!Object.values(POST_PRIORITY).includes(priority)) {
    throw new Error(`Unknown priority: ${priority}`);
  }
  if (!Object.values(WRITING_STATUS).includes(writing)) {
    throw new Error(`Unknown writing status: ${writing}`);
  }
  if (!Object.values(PUBLISHED_STATUS).includes(publication)) {
    throw new Error(`Unknown publication status: ${publication}`);
  }
  if (!MEMO_STATES.includes(memo)) {
    throw new Error(`Unknown memo state: ${memo}`);
  }
  if (Number.isNaN(updated)) {
    throw new Error(`Invalid updated date: ${element.dataset.updated}`);
  }

  return {
    element,
    title: element.dataset.title ?? "",
    search: element.dataset.search ?? "",
    pinned: element.dataset.pinned === "true",
    priority,
    writing,
    publication,
    memo,
    categories: parseStringArray(
      element.dataset.categories ?? "[]",
      "categories",
    ),
    tags: parseStringArray(element.dataset.tags ?? "[]", "tags"),
    published: element.dataset.published ?? "",
    updated,
  };
};

const isGroupName = (value: string | null): value is GroupName =>
  value !== null && GROUP_NAMES.includes(value as GroupName);

const isSortColumn = (value: string): value is SortColumn =>
  SORT_COLUMNS.includes(value as SortColumn);

const isSortName = (value: string | null): value is SortName => {
  if (value === null) return false;
  if (value === "recommended") return true;

  const [column, direction] = value.split("-");
  return (
    column !== undefined &&
    isSortColumn(column) &&
    (direction === "asc" || direction === "desc")
  );
};

const parseSort = (sort: SortName) => {
  if (sort === "recommended") return null;

  const [column, direction] = sort.split("-");
  if (column === undefined || !isSortColumn(column)) {
    throw new Error(`Unknown sort column: ${sort}`);
  }
  return { column, direction: direction as SortDirection };
};

const getAllowedValues = <T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
) =>
  params
    .getAll(key)
    .filter((value): value is T => allowed.includes(value as T));

const readStateFromUrl = (
  categories: string[],
  tags: string[],
  recentDayOptions: number[],
): PreviewState => {
  const params = new URLSearchParams(window.location.search);
  const state = createBaseState();
  const group = params.get("group");
  const sort = params.get("sort");
  state.query = params.get("q") ?? "";
  state.group = isGroupName(group) ? group : "none";
  state.sort = isSortName(sort) ? sort : "recommended";
  state.priority = getAllowedValues(
    params,
    "priority",
    Object.values(POST_PRIORITY),
  );
  state.writing = getAllowedValues(
    params,
    "writing",
    Object.values(WRITING_STATUS),
  );
  state.publication = getAllowedValues(
    params,
    "publication",
    Object.values(PUBLISHED_STATUS),
  );
  state.memo = getAllowedValues(params, "memo", MEMO_STATES);
  state.category = getAllowedValues(params, "category", categories);
  state.tag = getAllowedValues(params, "tag", tags);
  const recent = Number(params.get("recent"));
  state.recentDays = recentDayOptions.includes(recent) ? recent : 0;
  return state;
};

const writeStateToUrl = (state: PreviewState) => {
  const url = new URL(window.location.href);
  url.search = "";

  if (state.query) url.searchParams.set("q", state.query);
  if (state.group !== "none") url.searchParams.set("group", state.group);
  if (state.sort !== "recommended") url.searchParams.set("sort", state.sort);
  state.priority.forEach((value) => url.searchParams.append("priority", value));
  state.writing.forEach((value) => url.searchParams.append("writing", value));
  state.publication.forEach((value) =>
    url.searchParams.append("publication", value),
  );
  state.memo.forEach((value) => url.searchParams.append("memo", value));
  state.category.forEach((value) => url.searchParams.append("category", value));
  state.tag.forEach((value) => url.searchParams.append("tag", value));
  if (state.recentDays > 0) {
    url.searchParams.set("recent", String(state.recentDays));
  }
  window.history.replaceState(null, "", url);
};

const getGroupDefinitions = (group: GroupName): GroupDefinition[] => {
  if (group === "priority") {
    return Object.values(POST_PRIORITY)
      .sort((a, b) => POST_PRIORITY_ORDER[a] - POST_PRIORITY_ORDER[b])
      .map((value) => ({ value, label: POST_PRIORITY_LABELS[value] }));
  }
  if (group === "writing") {
    return Object.values(WRITING_STATUS)
      .sort((a, b) => WRITING_STATUS_ORDER[a] - WRITING_STATUS_ORDER[b])
      .map((value) => ({ value, label: WRITING_STATUS_LABELS[value] }));
  }
  if (group === "publication") {
    return Object.values(PUBLISHED_STATUS)
      .sort((a, b) => PUBLISHED_STATUS_ORDER[a] - PUBLISHED_STATUS_ORDER[b])
      .map((value) => ({ value, label: PUBLISHED_STATUS_LABELS[value] }));
  }
  return [{ value: "all", label: "" }];
};

const getGroupValue = (row: PreviewRow, group: GroupName) => {
  if (group === "priority") return row.priority;
  if (group === "writing") return row.writing;
  if (group === "publication") return row.publication;
  return "all";
};

const matchesState = (
  row: PreviewRow,
  state: PreviewState,
  recentCutoff: string,
) => {
  const query = normalizeSearchText(state.query.trim());
  if (query && !row.search.includes(query)) return false;
  if (state.priority.length > 0 && !state.priority.includes(row.priority)) {
    return false;
  }
  if (state.writing.length > 0 && !state.writing.includes(row.writing)) {
    return false;
  }
  if (
    state.publication.length > 0 &&
    !state.publication.includes(row.publication)
  ) {
    return false;
  }
  if (state.memo.length > 0 && !state.memo.includes(row.memo)) return false;
  if (
    state.category.length > 0 &&
    !state.category.some((category) => row.categories.includes(category))
  ) {
    return false;
  }
  if (
    state.tag.length > 0 &&
    !state.tag.some((tag) => row.tags.includes(tag))
  ) {
    return false;
  }
  if (state.recentDays > 0 && row.published < recentCutoff) return false;
  return true;
};

const compareTitle = (a: PreviewRow, b: PreviewRow) =>
  a.title.localeCompare(b.title, "ja");

const compareRecommended = (a: PreviewRow, b: PreviewRow) => {
  const priorityDiff =
    POST_PRIORITY_ORDER[a.priority] - POST_PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;

  const writingDiff =
    WRITING_STATUS_ORDER[a.writing] - WRITING_STATUS_ORDER[b.writing];
  if (writingDiff !== 0) return writingDiff;
  return compareTitle(a, b);
};

const compareColumn = (a: PreviewRow, b: PreviewRow, column: SortColumn) => {
  if (column === "title") return compareTitle(a, b);
  if (column === "priority") {
    return POST_PRIORITY_ORDER[a.priority] - POST_PRIORITY_ORDER[b.priority];
  }
  if (column === "writing") {
    return WRITING_STATUS_ORDER[a.writing] - WRITING_STATUS_ORDER[b.writing];
  }
  if (column === "publication") {
    return (
      PUBLISHED_STATUS_ORDER[a.publication] -
      PUBLISHED_STATUS_ORDER[b.publication]
    );
  }
  if (column === "memo") {
    return MEMO_STATE_ORDER[a.memo] - MEMO_STATE_ORDER[b.memo];
  }
  return a.updated - b.updated;
};

const sortRows = (rows: PreviewRow[], sort: SortName) => {
  const parsed = parseSort(sort);
  if (parsed === null) return rows.sort(compareRecommended);

  const { column, direction } = parsed;
  return rows.sort((a, b) => {
    const columnDiff = compareColumn(a, b, column);
    if (columnDiff !== 0)
      return direction === "desc" ? -columnDiff : columnDiff;
    return compareTitle(a, b);
  });
};

const getNextSort = (current: SortName, column: SortColumn): SortName => {
  const parsed = parseSort(current);
  const defaultDirection = DEFAULT_SORT_DIRECTION[column];

  if (parsed === null || parsed.column !== column) {
    return `${column}-${defaultDirection}`;
  }
  if (parsed.direction === defaultDirection) {
    return `${column}-${defaultDirection === "asc" ? "desc" : "asc"}`;
  }
  return "recommended";
};

const createGroupBody = (
  definition: GroupDefinition,
  group: GroupName,
  rows: PreviewRow[],
  collapsed: boolean,
) => {
  const body = document.createElement("tbody");
  body.className = "preview-post-group";
  body.dataset.postGroup = definition.value;

  if (group !== "none") {
    const headingRow = document.createElement("tr");
    headingRow.className = "preview-group-row";
    const heading = document.createElement("th");
    heading.colSpan = TABLE_COLUMN_COUNT;
    heading.scope = "rowgroup";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preview-group-toggle";
    button.dataset.groupToggle = `${group}:${definition.value}`;
    button.setAttribute("aria-expanded", String(!collapsed));
    const chevron = document.createElement("span");
    chevron.className = "preview-group-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "▾";
    const label = document.createElement("span");
    label.textContent = definition.label;
    const count = document.createElement("span");
    count.className = "preview-group-count";
    count.textContent = `${rows.length}件`;
    button.append(chevron, label, count);
    heading.append(button);
    headingRow.append(heading);
    body.append(headingRow);
  }

  rows.forEach((row) => {
    row.element.hidden = collapsed;
    body.append(row.element);
  });
  return body;
};

const getFilterLabel = (key: FilterKey, value: string) => {
  if (key === "priority") {
    return `優先度: ${POST_PRIORITY_LABELS[value as PostPriority]}`;
  }
  if (key === "writing") {
    return `執筆: ${WRITING_STATUS_LABELS[value as WritingStatus]}`;
  }
  if (key === "publication") {
    return `公開: ${PUBLISHED_STATUS_LABELS[value as PublishedStatus]}`;
  }
  if (key === "memo") return `メモ: ${MEMO_STATE_LABELS[value as MemoState]}`;
  if (key === "tag") return `タグ: ${value}`;
  return `カテゴリ: ${value}`;
};

const initializePreviewPosts = (root: HTMLElement) => {
  const controls = root.querySelector("[data-preview-controls]");
  const searchInput = root.querySelector("[data-search-input]");
  const groupSelect = root.querySelector("[data-group-select]");
  const resultCount = root.querySelector("[data-result-count]");
  const table = root.querySelector("table");
  const tableWrap = root.querySelector("[data-table-wrap]");
  const emptyState = root.querySelector("[data-empty-state]");
  const activeFilters = root.querySelector("[data-active-filters]");
  const filterChips = root.querySelector("[data-filter-chips]");
  const filterCount = root.querySelector("[data-filter-count]");
  const filterDetails = root.querySelector("[data-filter-details]");

  if (!(controls instanceof HTMLFormElement))
    throw new Error("Preview controls not found");
  if (!(searchInput instanceof HTMLInputElement))
    throw new Error("Search input not found");
  if (!(groupSelect instanceof HTMLSelectElement))
    throw new Error("Group select not found");
  if (!(resultCount instanceof HTMLElement))
    throw new Error("Result count not found");
  if (!(table instanceof HTMLTableElement))
    throw new Error("Preview table not found");
  if (!(tableWrap instanceof HTMLElement))
    throw new Error("Table wrapper not found");
  if (!(emptyState instanceof HTMLElement))
    throw new Error("Empty state not found");
  if (!(activeFilters instanceof HTMLElement))
    throw new Error("Active filters not found");
  if (!(filterChips instanceof HTMLElement))
    throw new Error("Filter chips not found");
  if (!(filterCount instanceof HTMLElement))
    throw new Error("Filter count not found");
  if (!(filterDetails instanceof HTMLDetailsElement))
    throw new Error("Filter details not found");

  const rows = Array.from(
    root.querySelectorAll<HTMLTableRowElement>("[data-post-row]"),
    getRow,
  );
  const categoryValues = Array.from(
    root.querySelectorAll<HTMLInputElement>(
      'input[data-filter-key="category"]',
    ),
    (input) => input.value,
  );
  const tagValues = Array.from(
    root.querySelectorAll<HTMLInputElement>('input[data-filter-key="tag"]'),
    (input) => input.value,
  );
  const recentButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-recent-button]"),
  );
  const recentDayOptions = recentButtons.map((button) => {
    const days = Number(button.dataset.recentButton);
    if (!Number.isInteger(days) || days < 1) {
      throw new Error(`Invalid recent days: ${button.dataset.recentButton}`);
    }
    return days;
  });
  const total = rows.length;
  const collapsedGroups = new Set<string>();
  let state = readStateFromUrl(categoryValues, tagValues, recentDayOptions);

  const getFilterInputs = () =>
    Array.from(
      controls.querySelectorAll<HTMLInputElement>("input[data-filter-key]"),
    );

  const getStateValues = (key: FilterKey) => {
    if (key === "priority") return state.priority;
    if (key === "writing") return state.writing;
    if (key === "publication") return state.publication;
    if (key === "memo") return state.memo;
    if (key === "tag") return state.tag;
    return state.category;
  };

  const sortButtons = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-sort-column]"),
  );

  const getSortColumn = (button: HTMLButtonElement) => {
    const column = button.dataset.sortColumn ?? "";
    if (!isSortColumn(column)) {
      throw new Error(`Unknown sort column: ${column}`);
    }
    return column;
  };

  const syncSortHeaders = () => {
    const parsed = parseSort(state.sort);
    sortButtons.forEach((button) => {
      const header = button.closest("th");
      if (!(header instanceof HTMLTableCellElement)) {
        throw new Error("Sort header not found");
      }

      if (parsed === null || parsed.column !== getSortColumn(button)) {
        header.setAttribute("aria-sort", "none");
        return;
      }
      header.setAttribute(
        "aria-sort",
        parsed.direction === "asc" ? "ascending" : "descending",
      );
    });
  };

  const syncControls = () => {
    searchInput.value = state.query;
    groupSelect.value = state.group;
    syncSortHeaders();
    getFilterInputs().forEach((input) => {
      const key = input.dataset.filterKey as FilterKey;
      input.checked = getStateValues(key).includes(input.value as never);
    });
    recentButtons.forEach((button) => {
      const days = Number(button.dataset.recentButton);
      button.setAttribute("aria-pressed", String(state.recentDays === days));
    });
  };

  const readStateFromControls = () => {
    const next = createBaseState();
    next.query = searchInput.value;
    next.group = isGroupName(groupSelect.value) ? groupSelect.value : "none";
    next.sort = state.sort;
    getFilterInputs()
      .filter((input) => input.checked)
      .forEach((input) => {
        const key = input.dataset.filterKey as FilterKey;
        if (key === "priority") next.priority.push(input.value as PostPriority);
        if (key === "writing") next.writing.push(input.value as WritingStatus);
        if (key === "publication") {
          next.publication.push(input.value as PublishedStatus);
        }
        if (key === "memo") next.memo.push(input.value as MemoState);
        if (key === "category") next.category.push(input.value);
        if (key === "tag") next.tag.push(input.value);
      });
    next.recentDays = state.recentDays;
    return next;
  };

  const updateFilterSummary = () => {
    const filterEntries: Array<[FilterKey, string]> = [
      ...state.priority.map((value): [FilterKey, string] => [
        "priority",
        value,
      ]),
      ...state.writing.map((value): [FilterKey, string] => ["writing", value]),
      ...state.publication.map((value): [FilterKey, string] => [
        "publication",
        value,
      ]),
      ...state.memo.map((value): [FilterKey, string] => ["memo", value]),
      ...state.category.map((value): [FilterKey, string] => [
        "category",
        value,
      ]),
      ...state.tag.map((value): [FilterKey, string] => ["tag", value]),
    ];
    const count = filterEntries.length + Number(state.recentDays > 0);
    filterCount.textContent = String(count);
    filterCount.hidden = count === 0;

    const labels = filterEntries.map(([key, value]) =>
      getFilterLabel(key, value),
    );
    if (state.query) labels.unshift(`検索: ${state.query}`);
    if (state.recentDays > 0) labels.push(`最近の記事: ${state.recentDays}日`);
    const active = labels.length > 0;
    filterChips.replaceChildren(
      ...labels.map((text) => {
        const chip = document.createElement("span");
        chip.className = "preview-filter-chip";
        chip.textContent = text;
        return chip;
      }),
    );
    activeFilters.hidden = !active;
    return active;
  };

  const render = () => {
    const recentCutoff =
      state.recentDays > 0 ? getRecentCutoff(state.recentDays) : "";
    const visibleRows = sortRows(
      rows.filter((row) => matchesState(row, state, recentCutoff)),
      state.sort,
    );
    const definitions = getGroupDefinitions(state.group);
    root.dataset.group = state.group;
    table
      .querySelectorAll("tbody[data-post-group]")
      .forEach((body) => body.remove());

    // ピン留めは絞り込みには従うが、並び替えとグループ分けより前に出す。
    // 数が少なく常に見えているべきものなので、見出しも折りたたみも付けない
    const pinnedRows = visibleRows.filter((row) => row.pinned);
    const unpinnedRows = visibleRows.filter((row) => !row.pinned);
    if (pinnedRows.length > 0) {
      table.append(createGroupBody(PINNED_GROUP, "none", pinnedRows, false));
    }

    definitions.forEach((definition) => {
      const groupRows = unpinnedRows.filter(
        (row) => getGroupValue(row, state.group) === definition.value,
      );
      if (groupRows.length === 0) return;

      const groupKey = `${state.group}:${definition.value}`;
      const body = createGroupBody(
        definition,
        state.group,
        groupRows,
        collapsedGroups.has(groupKey),
      );
      table.append(body);
    });

    resultCount.textContent = `表示中 ${visibleRows.length} / 全${total}件`;
    tableWrap.hidden = visibleRows.length === 0;
    emptyState.hidden = visibleRows.length > 0;
    const filterActive = updateFilterSummary();
    root.toggleAttribute("data-filter-active", filterActive);
  };

  const applyState = (nextState: PreviewState) => {
    state = nextState;
    syncControls();
    render();
    writeStateToUrl(state);
  };

  controls.addEventListener("submit", (event) => event.preventDefault());
  sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyState({
        ...state,
        sort: getNextSort(state.sort, getSortColumn(button)),
      });
    });
  });
  recentButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const days = Number(button.dataset.recentButton);
      applyState({
        ...state,
        recentDays: state.recentDays === days ? 0 : days,
      });
    });
  });
  searchInput.addEventListener("input", () => {
    applyState(readStateFromControls());
  });
  controls.addEventListener("change", () => {
    applyState(readStateFromControls());
  });
  root
    .querySelectorAll<HTMLButtonElement>("[data-filter-clear]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const next = { ...state };
        next.priority = [];
        next.writing = [];
        next.publication = [];
        next.memo = [];
        next.category = [];
        next.tag = [];
        next.recentDays = 0;
        applyState(next);
      });
    });
  root
    .querySelectorAll<HTMLButtonElement>("[data-clear-all]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const next = createBaseState();
        next.group = state.group;
        next.sort = state.sort;
        applyState(next);
      });
    });
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "[data-group-toggle]",
    );
    if (!button || !root.contains(button)) return;

    const groupKey = button.dataset.groupToggle;
    if (!groupKey) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    if (expanded) collapsedGroups.add(groupKey);
    else collapsedGroups.delete(groupKey);
    const body = button.closest("tbody");
    body
      ?.querySelectorAll<HTMLTableRowElement>("[data-post-row]")
      .forEach((row) => {
        row.hidden = expanded;
      });
  });
  document.addEventListener("pointerdown", (event) => {
    if (
      filterDetails.open &&
      event.target instanceof Node &&
      !filterDetails.contains(event.target)
    ) {
      filterDetails.open = false;
    }
  });
  const tooltipAnchors = root.querySelectorAll<HTMLElement>(
    "[data-tooltip-anchor]",
  );
  tooltipAnchors.forEach((anchor) => {
    anchor.addEventListener("pointerenter", () => {
      anchor.classList.remove("is-tooltip-dismissed");
    });
    anchor.addEventListener("pointerleave", () => {
      anchor.classList.remove("is-tooltip-dismissed");
    });
    anchor.addEventListener("focusin", () => {
      anchor.classList.remove("is-tooltip-dismissed");
    });
    anchor.addEventListener("focusout", () => {
      anchor.classList.remove("is-tooltip-dismissed");
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    filterDetails.open = false;
    root
      .querySelectorAll<HTMLElement>("[data-tooltip-anchor]:hover")
      .forEach((anchor) => anchor.classList.add("is-tooltip-dismissed"));
    if (document.activeElement instanceof Element) {
      document.activeElement
        .closest<HTMLElement>("[data-tooltip-anchor]")
        ?.classList.add("is-tooltip-dismissed");
    }
  });
  window.addEventListener("popstate", () => {
    state = readStateFromUrl(categoryValues, tagValues, recentDayOptions);
    syncControls();
    render();
  });

  recentButtons.forEach((button) => {
    const days = Number(button.dataset.recentButton);
    const cutoff = getRecentCutoff(days);
    const total = rows.filter((row) => row.published >= cutoff).length;
    const count = button.querySelector("[data-recent-count]");
    if (!(count instanceof HTMLElement)) {
      throw new Error("Recent count not found");
    }
    count.textContent = total > 0 ? String(total) : "";
  });

  syncControls();
  render();
  writeStateToUrl(state);
  initPreviewInlineEdit(root);
};

export const initPreviewPosts = () => {
  document
    .querySelectorAll<HTMLElement>("preview-posts")
    .forEach(initializePreviewPosts);
};
