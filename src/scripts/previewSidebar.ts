import { normalizeSearchText } from "~/utils/search";

const QUERY_KEY = "preview-sidebar:query";
const FILTER_KEY = "preview-sidebar:filters";

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
  const count = requireElement(host, "[data-sidebar-count]", HTMLElement);
  const dialog = requireElement(
    host,
    "[data-sidebar-filter-dialog]",
    HTMLDialogElement,
  );
  const filterOpen = requireElement(
    host,
    "[data-sidebar-filter-open]",
    HTMLButtonElement,
  );
  const filterClose = requireElement(
    host,
    "[data-sidebar-filter-close]",
    HTMLButtonElement,
  );
  // 解除はバーとダイアログの両方に置く。どちらから押しても同じ
  const clears = Array.from(
    host.querySelectorAll<HTMLButtonElement>("[data-sidebar-clear]"),
  );

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
    clears.forEach((button) => {
      button.hidden = !active;
    });
    filterOpen.toggleAttribute("data-active", active);
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

  clears.forEach((button) =>
    button.addEventListener("click", () => {
      input.value = "";
      selects.forEach((select) => {
        select.value = "";
      });
      apply();
      writeStorage(QUERY_KEY, "");
      persistFilters();
      focusCurrent();
    }),
  );

  filterOpen.addEventListener("click", () => {
    dialog.showModal();
    // 開いた直後から打ち始められるようにする。前の語は選択して上書きしやすく
    input.focus();
    input.select();
    // 一覧の中で今の記事がどこにいるかは、開いた時点で見えている必要がある
    focusCurrent();
  });

  filterClose.addEventListener("click", () => dialog.close());

  // 面の外を押したら閉じる。Escape は dialog の既定に任せる
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // 記事を移動するたびに読み込み直すため、検索と絞り込みは引き継ぐ
  const stored = readFilters();
  selects.forEach((select) => {
    const value = stored[select.dataset.sidebarFilter ?? ""];
    if (value !== undefined) select.value = value;
  });
  input.value = readStorage(QUERY_KEY) ?? "";

  apply();
};

export const initPreviewSidebar = () => {
  document
    .querySelectorAll<HTMLElement>("preview-sidebar")
    .forEach(initializeSidebar);
};
