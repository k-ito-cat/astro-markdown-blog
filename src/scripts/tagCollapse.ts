import { onPageEvent, onPageCleanup } from "~/scripts/pageLifecycle";
import { tagListSort } from "~/scripts/tagSortMode";

export const initTagCollapse = () => {
  const nav = document.querySelector<HTMLElement>("[data-tag-nav]");
  const list = document.querySelector<HTMLElement>("#tag-list");
  const toggle = document.querySelector<HTMLButtonElement>("[data-tag-toggle]");
  const sortToggle =
    document.querySelector<HTMLButtonElement>("[data-tag-sort]");
  const collapse = document.querySelector<HTMLButtonElement>(
    "[data-tag-collapse]",
  );
  if (!nav || !list || !toggle || !sortToggle || !collapse) return;

  // 頭文字順は見出しで区切って縦に読む並びなので、折りたたみとは両立させない
  let expanded = tagListSort.isAlpha();

  const render = () => {
    const alpha = tagListSort.isAlpha();
    nav.classList.toggle("is-collapsed", !expanded);
    nav.classList.toggle("is-alpha", alpha);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "タグを折りたたむ" : "すべてのタグを表示";
    sortToggle.setAttribute("aria-pressed", String(alpha));
  };

  onPageCleanup(
    tagListSort.onChange((alpha) => {
      if (alpha) expanded = true;
      render();
    }),
  );

  // 折りたたみ（3行の横並び）で溢れないなら、開く必要が無いので誘導を出さない
  const measure = () => {
    const wasExpanded = expanded;
    expanded = false;
    render();
    const overflows = list.scrollWidth > list.clientWidth + 1;
    nav.classList.toggle("is-overflowing", overflows);
    toggle.hidden = !overflows;
    sortToggle.hidden = false;
    expanded = tagListSort.isAlpha() || (overflows ? wasExpanded : false);
    render();
  };

  const fold = () => {
    expanded = false;
    // たたんだ先は件数順の横並びなので、頭文字順のままにはしない
    tagListSort.setAlpha(false);
    render();
  };

  toggle.addEventListener("click", () => {
    if (expanded) {
      fold();
      return;
    }
    expanded = true;
    render();
  });

  // 末尾から閉じると読んでいた位置が記録の途中へ飛ぶので、一覧の頭へ戻す
  collapse.addEventListener("click", () => {
    fold();
    nav.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  });

  sortToggle.addEventListener("click", () => {
    tagListSort.setAlpha(!tagListSort.isAlpha());
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
  onPageCleanup(() => window.clearTimeout(resizeTimer));
  onPageEvent(window, "resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(measure, 150);
  });

  measure();
};
