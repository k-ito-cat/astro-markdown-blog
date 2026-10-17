/**
 * UIプレビュー（CMP-017）のタブ。WAI-ARIA の Tabs パターンに従う。
 *
 * タブは JS が動いてから出す。それまでは 2 つのパネルを上下に並べたままにし、
 * JS が動かない環境でもモックとコードの両方を読めるようにする。
 * 切り替えは押した時点で行い（自動で選ぶ形）、矢印・Home・End でも移れる。
 */
const READY = "data-mock-ready";

const select = (tabs: HTMLButtonElement[], next: HTMLButtonElement) => {
  tabs.forEach((tab) => {
    const selected = tab === next;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;

    const panel = document.getElementById(
      tab.getAttribute("aria-controls") ?? "",
    );
    if (panel) panel.hidden = !selected;
  });
};

export const initMockUi = (signal: AbortSignal) => {
  document.querySelectorAll<HTMLElement>("[data-mock-ui]").forEach((mock) => {
    if (mock.hasAttribute(READY)) return;

    const tabs = Array.from(
      mock.querySelectorAll<HTMLButtonElement>("[data-mock-tab]"),
    );
    const first = tabs[0];
    if (!first) return;

    select(tabs, first);
    mock.setAttribute(READY, "");

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => select(tabs, tab), { signal });
      tab.addEventListener(
        "keydown",
        (event) => {
          const last = tabs.length - 1;
          const target =
            event.key === "ArrowRight"
              ? tabs[index === last ? 0 : index + 1]
              : event.key === "ArrowLeft"
                ? tabs[index === 0 ? last : index - 1]
                : event.key === "Home"
                  ? tabs[0]
                  : event.key === "End"
                    ? tabs[last]
                    : null;
          if (!target) return;

          event.preventDefault();
          select(tabs, target);
          target.focus();
        },
        { signal },
      );
    });
  });
};
