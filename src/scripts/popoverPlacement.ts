const POPOVER_GAP = 4;
const VIEWPORT_MARGIN = 8;

/**
 * position: fixed の popover を、開閉ボタンの直下へ置く。
 * 右端ではみ出す分は左へ寄せ、下に収まらなければボタンの上へ開く
 */
export const placePopoverBelow = (
  trigger: HTMLElement,
  popover: HTMLElement,
) => {
  const anchor = trigger.getBoundingClientRect();
  const panel = popover.getBoundingClientRect();
  const left = Math.max(
    VIEWPORT_MARGIN,
    Math.min(anchor.left, window.innerWidth - panel.width - VIEWPORT_MARGIN),
  );
  const overflowsBottom =
    anchor.bottom + POPOVER_GAP + panel.height >
    window.innerHeight - VIEWPORT_MARGIN;
  const top = overflowsBottom
    ? Math.max(VIEWPORT_MARGIN, anchor.top - POPOVER_GAP - panel.height)
    : anchor.bottom + POPOVER_GAP;

  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
};
