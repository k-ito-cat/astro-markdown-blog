/*
 * ページ遷移は通常の document navigation なので、初期化はページごとに一度で済む。
 * BFCache から戻ったページは状態ごと復元されるため、初期化し直さない
 */
const pageController = new AbortController();

export const pageSignal = () => pageController.signal;
export const pageReferrer = () => document.referrer;

export const onPageCleanup = (cleanup: () => void) => {
  pageSignal().addEventListener("abort", cleanup, { once: true });
};

export const observePage = <T extends { disconnect(): void }>(
  observer: T,
): T => {
  onPageCleanup(() => observer.disconnect());
  return observer;
};

export const onPageLoad = (initialize: () => void | Promise<void>) => {
  void initialize();
};

export function onPageEvent<K extends keyof WindowEventMap>(
  target: Window | Document,
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options: AddEventListenerOptions = {},
) {
  target.addEventListener(type, listener as EventListener, {
    ...options,
    signal: pageSignal(),
  });
}
