import { normalizeSearchText } from "~/utils/previewPost";

const QUERY_KEY = "preview-sidebar:query";
const FILTER_KEY = "preview-sidebar:filters";
const COLLAPSED_KEY = "preview-sidebar:collapsed";
const COLLAPSED_ATTRIBUTE = "data-preview-sidebar";

const readStorage = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    if (value === "") sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* 状態が引き継がれないだけなので続行する */
  }
};

const isCollapsed = () =>
  document.documentElement.getAttribute(COLLAPSED_ATTRIBUTE) === "collapsed";

const setCollapsed = (collapsed: boolean) => {
  if (collapsed) {
    document.documentElement.dataset.previewSidebar = "collapsed";
  } else {
    delete document.documentElement.dataset.previewSidebar;
  }
  writeStorage(COLLAPSED_KEY, collapsed ? "1" : "");
};

const readFilters = (): Record<string, string> => {
  const raw = readStorage(FILTER_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
};

const requireElement = <T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  type: { new (): T },
) => {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Not found: ${selector}`);
  return element;
};

const initializeSidebar = (host: HTMLElement) => {
  const input = requireElement(host, "[data-sidebar-search]", HTMLInputElement);
  const empty = requireElement(host, "[data-sidebar-empty]", HTMLElement);
  const list = requireElement(host, ".preview-sidebar-list", HTMLElement);
  const toggle = requireElement(
    host,
    "[data-sidebar-toggle]",
    HTMLButtonElement,
  );
  const body = requireElement(host, "#preview-sidebar-body", HTMLElement);
  const count = requireElement(host, "[data-sidebar-count]", HTMLElement);
  const clear = requireElement(host, "[data-sidebar-clear]", HTMLButtonElement);

  const items = Array.from(
    host.querySelectorAll<HTMLElement>("[data-sidebar-item]"),
  );
  const selects = Array.from(
    host.querySelectorAll<HTMLSelectElement>("[data-sidebar-filter]"),
  );

  const apply = () => {
    const query = normalizeSearchText(input.value.trim());
    const active =
      query !== "" || selects.some((select) => select.value !== "");
    let visible = 0;

    items.forEach((item) => {
      // 検索と各絞り込みを順に適用するだけで、条件の組み合わせ方は選ばせない
      const matched =
        (query === "" || (item.dataset.search ?? "").includes(query)) &&
        selects.every((select) => {
          if (select.value === "") return true;

          const key = select.dataset.sidebarFilter ?? "";
          return item.dataset[key] === select.value;
        });

      item.hidden = !matched;
      if (matched) visible += 1;
    });

    selects.forEach((select) =>
      select.toggleAttribute("data-active", select.value !== ""),
    );
    count.textContent = active ? `${visible}/${items.length}` : "";
    clear.hidden = !active;
    empty.hidden = visible > 0;
  };

  const persistFilters = () => {
    const entries = selects
      .filter((select) => select.value !== "")
      .map((select) => [select.dataset.sidebarFilter ?? "", select.value]);
    writeStorage(
      FILTER_KEY,
      entries.length === 0 ? "" : JSON.stringify(Object.fromEntries(entries)),
    );
  };

  const syncToggle = () => {
    const collapsed = isCollapsed();
    toggle.setAttribute("aria-expanded", String(!collapsed));
    // 畳んでいる間は見えないので、キーボードの巡回からも外す
    body.toggleAttribute("inert", collapsed);
    const label = collapsed ? "記事一覧を開く" : "記事一覧を閉じる";
    toggle.title = label;
    toggle.setAttribute("aria-label", label);
  };

  // 現在の記事が一覧の外にあると見つけられないので、視界に入れる
  const focusCurrent = () => {
    const current = list.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!current || current.closest("[hidden]")) return;

    const currentRect = current.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (listRect.height === 0) return;

    list.scrollTop += currentRect.top - listRect.top - listRect.height / 2;
  };

  input.addEventListener("input", () => {
    apply();
    writeStorage(QUERY_KEY, input.value);
  });

  selects.forEach((select) =>
    select.addEventListener("change", () => {
      apply();
      persistFilters();
    }),
  );

  clear.addEventListener("click", () => {
    input.value = "";
    selects.forEach((select) => {
      select.value = "";
    });
    apply();
    writeStorage(QUERY_KEY, "");
    persistFilters();
    focusCurrent();
  });

  toggle.addEventListener("click", () => {
    const collapsed = !isCollapsed();
    setCollapsed(collapsed);
    syncToggle();
    // 開いた直後は現在位置が見えている必要がある
    if (!collapsed) focusCurrent();
  });

  // 記事を移動するたびに読み込み直すため、検索と絞り込みは引き継ぐ
  const stored = readFilters();
  selects.forEach((select) => {
    const value = stored[select.dataset.sidebarFilter ?? ""];
    if (value !== undefined) select.value = value;
  });
  input.value = readStorage(QUERY_KEY) ?? "";

  syncToggle();
  apply();
  focusCurrent();
};

export const initPreviewSidebar = () => {
  document
    .querySelectorAll<HTMLElement>("preview-sidebar")
    .forEach(initializeSidebar);
};
