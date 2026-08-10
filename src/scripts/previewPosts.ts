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
import type { MemoState } from "~/utils/previewPost";

type GroupName = "priority" | "writing" | "publication" | "none";
type SortName =
  | "recommended"
  | "updated-desc"
  | "updated-asc"
  | "title"
  | "priority";
type FilterKey = "priority" | "writing" | "publication" | "memo" | "category";

type PreviewState = {
  query: string;
  group: GroupName;
  sort: SortName;
  priority: PostPriority[];
  writing: WritingStatus[];
  publication: PublishedStatus[];
  memo: MemoState[];
  category: string[];
  issuesOnly: boolean;
};

type PreviewRow = {
  element: HTMLTableRowElement;
  title: string;
  search: string;
  priority: PostPriority;
  writing: WritingStatus;
  publication: PublishedStatus;
  memo: MemoState;
  categories: string[];
  updated: number;
  issues: string[];
};

type GroupDefinition = {
  value: string;
  label: string;
};

const MEMO_STATE_LABELS: Record<MemoState, string> = {
  HAS_MEMO: "メモあり",
  EMPTY_MEMO: "空メモ",
  NO_MEMO: "メモなし",
  BROKEN_MEMO: "メモ不正",
};

const GROUP_NAMES = ["priority", "writing", "publication", "none"] as const;
const SORT_NAMES = [
  "recommended",
  "updated-desc",
  "updated-asc",
  "title",
  "priority",
] as const;
const MEMO_STATES = [
  "HAS_MEMO",
  "EMPTY_MEMO",
  "NO_MEMO",
  "BROKEN_MEMO",
] as const;

const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja");

const createBaseState = (): PreviewState => ({
  query: "",
  group: "priority",
  sort: "recommended",
  priority: [],
  writing: [],
  publication: [],
  memo: [],
  category: [],
  issuesOnly: false,
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
    priority,
    writing,
    publication,
    memo,
    categories: parseStringArray(
      element.dataset.categories ?? "[]",
      "categories",
    ),
    updated,
    issues: parseStringArray(element.dataset.issues ?? "[]", "issues"),
  };
};

const isGroupName = (value: string | null): value is GroupName =>
  value !== null && GROUP_NAMES.includes(value as GroupName);

const isSortName = (value: string | null): value is SortName =>
  value !== null && SORT_NAMES.includes(value as SortName);

const getAllowedValues = <T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
) =>
  params
    .getAll(key)
    .filter((value): value is T => allowed.includes(value as T));

const readStateFromUrl = (categories: string[]): PreviewState => {
  const params = new URLSearchParams(window.location.search);
  const state = createBaseState();
  const group = params.get("group");
  const sort = params.get("sort");
  state.query = params.get("q") ?? "";
  state.group = isGroupName(group) ? group : "priority";
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
  state.issuesOnly = params.get("issues") === "only";
  return state;
};

const writeStateToUrl = (state: PreviewState) => {
  const url = new URL(window.location.href);
  url.search = "";

  if (state.query) url.searchParams.set("q", state.query);
  if (state.group !== "priority") url.searchParams.set("group", state.group);
  if (state.sort !== "recommended") url.searchParams.set("sort", state.sort);
  state.priority.forEach((value) => url.searchParams.append("priority", value));
  state.writing.forEach((value) => url.searchParams.append("writing", value));
  state.publication.forEach((value) =>
    url.searchParams.append("publication", value),
  );
  state.memo.forEach((value) => url.searchParams.append("memo", value));
  state.category.forEach((value) => url.searchParams.append("category", value));
  if (state.issuesOnly) url.searchParams.set("issues", "only");
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

const matchesState = (row: PreviewRow, state: PreviewState) => {
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
  if (state.issuesOnly && row.issues.length === 0) return false;
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

const sortRows = (rows: PreviewRow[], sort: SortName) =>
  rows.sort((a, b) => {
    if (sort === "updated-desc") {
      return b.updated - a.updated || compareTitle(a, b);
    }
    if (sort === "updated-asc") {
      return a.updated - b.updated || compareTitle(a, b);
    }
    if (sort === "title") return compareTitle(a, b);
    if (sort === "priority") return compareRecommended(a, b);
    return compareRecommended(a, b);
  });

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
    heading.colSpan = 5;
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
  return `カテゴリ: ${value}`;
};

const initializePreviewPosts = (root: HTMLElement) => {
  const controls = root.querySelector("[data-preview-controls]");
  const searchInput = root.querySelector("[data-search-input]");
  const groupSelect = root.querySelector("[data-group-select]");
  const sortSelect = root.querySelector("[data-sort-select]");
  const resultCount = root.querySelector("[data-result-count]");
  const table = root.querySelector("table");
  const tableWrap = root.querySelector("[data-table-wrap]");
  const emptyState = root.querySelector("[data-empty-state]");
  const activeFilters = root.querySelector("[data-active-filters]");
  const filterChips = root.querySelector("[data-filter-chips]");
  const filterCount = root.querySelector("[data-filter-count]");
  const issuesOnlyInput = root.querySelector("[data-issues-only]");
  const filterDetails = root.querySelector("[data-filter-details]");

  if (!(controls instanceof HTMLFormElement))
    throw new Error("Preview controls not found");
  if (!(searchInput instanceof HTMLInputElement))
    throw new Error("Search input not found");
  if (!(groupSelect instanceof HTMLSelectElement))
    throw new Error("Group select not found");
  if (!(sortSelect instanceof HTMLSelectElement))
    throw new Error("Sort select not found");
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
  if (!(issuesOnlyInput instanceof HTMLInputElement))
    throw new Error("Issue filter not found");
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
  const total = rows.length;
  const collapsedGroups = new Set<string>();
  let state = readStateFromUrl(categoryValues);

  const getFilterInputs = () =>
    Array.from(
      controls.querySelectorAll<HTMLInputElement>("input[data-filter-key]"),
    );

  const getStateValues = (key: FilterKey) => {
    if (key === "priority") return state.priority;
    if (key === "writing") return state.writing;
    if (key === "publication") return state.publication;
    if (key === "memo") return state.memo;
    return state.category;
  };

  const syncControls = () => {
    searchInput.value = state.query;
    groupSelect.value = state.group;
    sortSelect.value = state.sort;
    getFilterInputs().forEach((input) => {
      const key = input.dataset.filterKey as FilterKey;
      input.checked = getStateValues(key).includes(input.value as never);
    });
    issuesOnlyInput.checked = state.issuesOnly;
  };

  const readStateFromControls = () => {
    const next = createBaseState();
    next.query = searchInput.value;
    next.group = isGroupName(groupSelect.value)
      ? groupSelect.value
      : "priority";
    next.sort = isSortName(sortSelect.value) ? sortSelect.value : "recommended";
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
      });
    next.issuesOnly = issuesOnlyInput.checked;
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
    ];
    const count = filterEntries.length + Number(state.issuesOnly);
    filterCount.textContent = String(count);
    filterCount.hidden = count === 0;

    const labels = filterEntries.map(([key, value]) =>
      getFilterLabel(key, value),
    );
    if (state.query) labels.unshift(`検索: ${state.query}`);
    if (state.issuesOnly) labels.push("要確認のみ");
    filterChips.replaceChildren(
      ...labels.map((text) => {
        const chip = document.createElement("span");
        chip.className = "preview-filter-chip";
        chip.textContent = text;
        return chip;
      }),
    );
    activeFilters.hidden = labels.length === 0;
  };

  const render = () => {
    const visibleRows = sortRows(
      rows.filter((row) => matchesState(row, state)),
      state.sort,
    );
    const definitions = getGroupDefinitions(state.group);
    root.dataset.group = state.group;
    table
      .querySelectorAll("tbody[data-post-group]")
      .forEach((body) => body.remove());

    definitions.forEach((definition) => {
      const groupRows = visibleRows.filter(
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
    updateFilterSummary();
  };

  const applyState = (nextState: PreviewState) => {
    state = nextState;
    syncControls();
    render();
    writeStateToUrl(state);
  };

  controls.addEventListener("submit", (event) => event.preventDefault());
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
        next.issuesOnly = false;
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
    state = readStateFromUrl(categoryValues);
    syncControls();
    render();
  });

  syncControls();
  render();
  writeStateToUrl(state);
};

export const initPreviewPosts = () => {
  document
    .querySelectorAll<HTMLElement>("preview-posts")
    .forEach(initializePreviewPosts);
};
