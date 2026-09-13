let pageController = new AbortController();
let previousUrl = document.referrer;
let didSwap = false;

export const pageSignal = () => pageController.signal;
export const pageReferrer = () => previousUrl;

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
  if (!document.startViewTransition) {
    void initialize();
    return;
  }
  document.addEventListener("astro:page-load", initialize);
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

document.addEventListener("astro:before-swap", (event) => {
  didSwap = true;
  previousUrl = event.from.href;
  pageController.abort();
  pageController = new AbortController();
  event.newDocument.documentElement.dataset.paper =
    document.documentElement.dataset.paper;
});

document.addEventListener("astro:page-load", () => {
  if (!didSwap) return;
  didSwap = false;
  if (document.activeElement !== document.body) return;
  const content = document.querySelector<HTMLElement>("main");
  if (!content) return;
  content.tabIndex = -1;
  content.focus({ preventScroll: true });
});

document.addEventListener("astro:after-swap", () => {
  document
    .querySelector("[data-theme-color]")
    ?.setAttribute(
      "content",
      document.documentElement.dataset.paper === "dim" ? "#efe8d9" : "#ffffff",
    );
});
