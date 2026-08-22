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

  // 折りたたみ（3行の横並び）で溢れないなら、開く必要が無いので誘導を出さない
  const measure = () => {
    const wasExpanded = expanded;
    expanded = false;
    render();
    const overflows = list.scrollWidth > list.clientWidth + 1;
    nav.classList.toggle("is-overflowing", overflows);
    toggle.hidden = !overflows;
    expanded = overflows ? wasExpanded : false;
    render();
  };

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    render();
  });

  // 折りたたみ中にタグを選んだら、隠れている行も見えるよう開く
  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("[data-filter-term]"))
      return;
    if (expanded) return;
    expanded = true;
    render();
  });

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 150);
  });

  measure();
};
