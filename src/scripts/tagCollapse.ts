const VISIBLE_ROWS = 3;
// 4行目をどれだけ覗かせるか（ぼかし帯の下に隠れる量）
const PEEK = 12;

const getRowOffsets = (list: HTMLElement) =>
  Array.from(
    new Set(
      Array.from(list.children, (item) => (item as HTMLElement).offsetTop),
    ),
  ).sort((a, b) => a - b);

export const initTagCollapse = () => {
  const nav = document.querySelector<HTMLElement>("[data-tag-nav]");
  const list = document.querySelector<HTMLElement>("#tag-list");
  const toggle = document.querySelector<HTMLButtonElement>("[data-tag-toggle]");
  if (!nav || !list || !toggle) return;

  let expanded = false;

  const render = () => {
    nav.classList.toggle("is-collapsed", !expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "タグを折りたたむ" : "すべてのタグを表示";
  };

  const measure = () => {
    // 行数の判定は展開状態で行う
    nav.classList.remove("is-collapsed");
    const rows = getRowOffsets(list);
    if (rows.length <= VISIBLE_ROWS) {
      toggle.hidden = true;
      expanded = true;
      render();
      return;
    }
    list.style.setProperty(
      "--tags-collapsed-height",
      `${rows[VISIBLE_ROWS] + PEEK}px`,
    );
    toggle.hidden = false;
    render();
  };

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 150);
  });

  measure();
};
