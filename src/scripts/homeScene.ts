/**
 * Home の時間軸と制作物を、別の場面として切り替える。
 *
 * 場面は `html[data-home-scene]` が持つ。描画前に index.astro の inline script が
 * hash から決めるため、script が無い環境では属性が付かず、縦並びのまま制作物へ届く。
 *
 * どちらの場面も下端でさらに下へ押し込むと、もう一方へ切り替わる。時間軸からは
 * 制作物の上端へ、制作物からは時間軸の先頭へ進み、一方向に巡る。上端は iPhone の
 * ブラウザが再読み込みに使い、overscroll-behavior でも止められないので使わない。
 * 押し込み量は `[data-scene-pull]` の `--pull`（0–1）として Line に渡す。
 *
 * 場面は `#works` と履歴に結ぶ。積むときは ClientRouter の navigate を通す。
 * ClientRouter は今いる URL を自分で覚えており、history.pushState で直接積むと
 * 戻る操作を hash の無い同じページへの遷移と取り違え、ページを取り直してしまう。
 */
import { navigate } from "astro:transitions/client";

type Scene = "timeline" | "works";

const WORKS_HASH = "#works";

/** wheel で閾値に届くまでの量(px) */
const WHEEL_THRESHOLD = 160;
/** touch で閾値に届くまでの指の移動量(px) */
const TOUCH_THRESHOLD = 72;
/**
 * 端へ着いた勢いを押し込みとして数えないための間(ms)。慣性の wheel は
 * これより短い間隔で届き続けるので、一度途切れてからの wheel だけを押し込みとする
 */
const GESTURE_GAP = 180;
/** 押し込みが途切れたら Line を戻すまでの間(ms) */
const RELEASE_DELAY = 240;
/** 端の判定の許容(px)。拡大率によっては scroll 量が整数に揃わない */
const EDGE_TOLERANCE = 2;

const PUSH_KEYS = new Set(["End", "PageDown", "ArrowDown", " "]);

const sceneFromHash = (): Scene =>
  location.hash === WORKS_HASH ? "works" : "timeline";

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest("input, textarea, select, button, summary, dialog") !==
      null);

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const initHomeScene = (signal: AbortSignal) => {
  const root = document.documentElement;
  if (!document.querySelector("[data-scene-pull]")) return;
  /*
   * 描画前の inline script が付けるが、ClientRouter は html の属性を新しいページの
   * ものへ入れ替える。script の再実行が漏れても場面を失わないよう、ここでも付ける
   */
  root.dataset.homeScene ??= sceneFromHash();

  const homePath = location.pathname;
  const pulls = new Map<Scene, HTMLElement>();
  document
    .querySelectorAll<HTMLElement>("[data-scene-pull]")
    .forEach((element) =>
      pulls.set(element.dataset.scenePull as Scene, element),
    );
  const headings: Record<Scene, HTMLElement | null> = {
    timeline: document.getElementById("record-flow-title"),
    works: document.getElementById("works-title"),
  };

  const currentScene = () => root.dataset.homeScene as Scene;
  let switching = false;
  // 自分で積んだ #works の上にいる間だけ、戻りを履歴の戻る操作に任せられる
  let worksPushed = false;
  // 巡って時間軸へ進むときは、戻る操作を借りても元の位置ではなく先頭へ出す
  let loopPending = false;
  let pull = 0;
  let lastWheelAt = 0;
  let releaseTimer = 0;
  let touchStartY: number | null = null;

  const distanceToBottom = () =>
    root.scrollHeight - (window.scrollY + window.innerHeight);

  const atEdge = () => distanceToBottom() <= EDGE_TOLERANCE;

  const setPull = (value: number) => {
    pull = Math.min(Math.max(value, 0), 1);
    const element = pulls.get(currentScene());
    if (!element) return;
    element.style.setProperty("--pull", String(pull));
    element.toggleAttribute("data-ready", pull >= 1);
  };

  const resetPull = () => {
    window.clearTimeout(releaseTimer);
    touchStartY = null;
    pulls.forEach((element) => element.removeAttribute("data-dragging"));
    setPull(0);
  };

  const showScene = (next: Scene, top: number) => {
    resetPull();
    // 場面が変わったら、次に行き先が見えた時にもう一度だけ chevron を弾ませる
    pulls.forEach((element) => element.removeAttribute("data-cue"));
    root.dataset.homeScene = next;
    window.scrollTo({ top, behavior: "instant" });
    headings[next]?.focus({ preventScroll: true });
  };

  const switchScene = (next: Scene, top = 0) => {
    if (next === currentScene() || switching) return;

    if (!document.startViewTransition || prefersReducedMotion()) {
      showScene(next, top);
      return;
    }

    switching = true;
    root.dataset.sceneTransition = "";
    const transition = document.startViewTransition(() =>
      showScene(next, top),
    );
    transition.finished.finally(() => {
      switching = false;
      delete root.dataset.sceneTransition;
    });
  };

  const openWorks = () => {
    if (currentScene() === "works" || switching) return;
    worksPushed = true;
    void navigate(WORKS_HASH);
    switchScene("works");
  };

  const closeWorks = () => {
    if (currentScene() === "timeline" || switching) return;
    // 自分で積んだ履歴なら戻る操作と同じにし、popstate で場面を替える
    if (worksPushed) {
      loopPending = true;
      history.back();
      return;
    }
    // 外から #works で来たときは、戻るとサイトの外へ出てしまうので置き換える
    history.replaceState(history.state, "", `${homePath}${location.search}`);
    switchScene("timeline");
  };

  const commit = () => {
    if (currentScene() === "timeline") openWorks();
    else closeWorks();
  };

  const scheduleRelease = () => {
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(resetPull, RELEASE_DELAY);
  };

  window.addEventListener(
    "wheel",
    (event) => {
      if (switching || event.ctrlKey) return;
      const now = performance.now();
      const gap = now - lastWheelAt;
      lastWheelAt = now;

      const lineScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      const delta = event.deltaY * lineScale;
      if (delta <= 0 || !atEdge()) {
        if (pull > 0) resetPull();
        return;
      }
      if (pull === 0 && gap < GESTURE_GAP) return;

      setPull(pull + delta / WHEEL_THRESHOLD);
      if (pull >= 1) commit();
      else scheduleRelease();
    },
    { passive: true, signal },
  );

  window.addEventListener(
    "touchstart",
    (event) => {
      touchStartY =
        !switching && event.touches.length === 1 && atEdge()
          ? event.touches[0].clientY
          : null;
    },
    { passive: true, signal },
  );

  window.addEventListener(
    "touchmove",
    (event) => {
      if (touchStartY === null) return;
      const distance = touchStartY - event.touches[0].clientY;
      pulls.get(currentScene())?.setAttribute("data-dragging", "");
      setPull(distance / TOUCH_THRESHOLD);
    },
    { passive: true, signal },
  );

  // 指を離すまでは送らない。閾値を越えてから指を戻せば取り消せる
  window.addEventListener(
    "touchend",
    () => {
      if (touchStartY === null) return;
      if (pull >= 1) commit();
      else resetPull();
    },
    { passive: true, signal },
  );
  window.addEventListener("touchcancel", resetPull, { passive: true, signal });

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        switching ||
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditable(event.target)
      )
        return;
      if (!PUSH_KEYS.has(event.key) || !atEdge()) return;
      // Shift+Space は上へ送る操作なので押し込みに数えない
      if (event.key === " " && event.shiftKey) return;
      event.preventDefault();
      commit();
    },
    { signal },
  );

  // ClientRouter より先に拾い、同じページの #works を scroll ではなく場面の切替にする
  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link || link.target) return;
      const url = new URL(link.href);
      if (url.pathname !== homePath || url.hash !== WORKS_HASH) return;
      event.preventDefault();
      if (currentScene() === "works") {
        window.scrollTo({ top: 0 });
        headings.works?.focus({ preventScroll: true });
        return;
      }
      openWorks();
    },
    { capture: true, signal },
  );

  window.addEventListener(
    "popstate",
    () => {
      if (location.pathname !== homePath) return;
      const next = sceneFromHash();
      // 進む操作で戻ってきた #works も自分で積んだものなので、戻りは履歴に任せられる
      worksPushed = next === "works";
      // ブラウザの戻る操作なら、時間軸の元いた位置へ戻す
      const top =
        next === "works" || loopPending ? 0 : (history.state?.scrollY ?? 0);
      loopPending = false;
      switchScene(next, top);
    },
    { signal },
  );

  // 行き先が見えた時に一度だけ data-cue を付け、chevron を弾ませて下端に気づかせる
  const cueObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting)
          entry.target.setAttribute("data-cue", "");
      });
    },
    { threshold: 1 },
  );
  pulls.forEach((element) => cueObserver.observe(element));

  signal.addEventListener(
    "abort",
    () => {
      window.clearTimeout(releaseTimer);
      cueObserver.disconnect();
    },
    { once: true },
  );
};
