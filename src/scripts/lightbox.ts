/**
 * 記事画像の拡大表示。
 *
 * 背景のスクロールを止めない。`overflow: hidden` を documentElement へ当てると
 * iOS ではその時点で読んでいた位置が潰れ、閉じたあとに戻す動きが往復のジャンプ
 * として見える。止めるのをやめれば位置は最初から失われない。背後へスクロールが
 * 伝播しないことは overscroll-behavior と touch-action で担保する。
 *
 * 画像送りは scroll snap に任せる。スワイプ、慣性、トラックパッドの横送りが
 * ブラウザの実装のまま使え、独自gestureを持たずに済む。
 */
const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

export const initLightbox = (signal: AbortSignal) => {
  const dialog = document.querySelector<HTMLDialogElement>("[data-lightbox]");
  const track = document.querySelector<HTMLElement>("[data-lightbox-track]");
  if (!dialog || !track) return;

  const thumbnails = Array.from(
    document.querySelectorAll<HTMLImageElement>(".article .prose img"),
  );
  if (thumbnails.length === 0) {
    dialog.remove();
    return;
  }

  const counter = dialog.querySelector<HTMLElement>("[data-lightbox-counter]");
  const steppers = Array.from(
    dialog.querySelectorAll<HTMLButtonElement>("[data-lightbox-step]"),
  );
  const single = thumbnails.length === 1;
  dialog.dataset.single = String(single);

  thumbnails.forEach((thumbnail) => {
    const slide = document.createElement("div");
    slide.className = "lightbox-slide";

    const image = document.createElement("img");
    // 一覧で選ばれた変換後の URL ではなく、記事が指している画像をそのまま出す
    image.src = thumbnail.src;
    image.alt = thumbnail.alt;
    image.decoding = "async";

    slide.append(image);
    track.append(slide);
  });

  const lastIndex = thumbnails.length - 1;
  let current = 0;

  const scrollToSlide = (index: number, behavior: ScrollBehavior) => {
    track.scrollTo({ left: index * track.clientWidth, behavior });
  };

  const syncCounter = () => {
    if (counter) counter.textContent = `${current + 1} / ${thumbnails.length}`;
    steppers.forEach((stepper) => {
      const step = Number(stepper.dataset.lightboxStep);
      stepper.disabled = clamp(current + step, lastIndex) === current;
    });
  };

  const open = (index: number) => {
    current = clamp(index, lastIndex);
    dialog.showModal();
    // showModal の直後は表示が確定しているので、幅を読んで位置を合わせられる
    scrollToSlide(current, "instant");
    syncCounter();
  };

  const step = (delta: number) => {
    current = clamp(current + delta, lastIndex);
    scrollToSlide(current, "smooth");
    syncCounter();
  };

  thumbnails.forEach((thumbnail, index) => {
    thumbnail.addEventListener("click", () => open(index), { signal });
  });

  // 送った先を数字へ反映する。scrollend は Safari が新しいため scroll で拾う
  let pending = 0;
  track.addEventListener(
    "scroll",
    () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        const width = track.clientWidth;
        if (width === 0) return;

        const index = clamp(Math.round(track.scrollLeft / width), lastIndex);
        if (index === current) return;

        current = index;
        syncCounter();
      });
    },
    { signal, passive: true },
  );

  steppers.forEach((stepper) => {
    stepper.addEventListener(
      "click",
      () => step(Number(stepper.dataset.lightboxStep)),
      { signal },
    );
  });

  dialog.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // 画像と操作部以外に触れたら閉じる。指の操作でも同じ判定で効く
      if (target.closest("img, button")) return;
      dialog.close();
    },
    { signal },
  );

  dialog.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      step(event.key === "ArrowRight" ? 1 : -1);
    },
    { signal },
  );

  // 閉じている間に幅が変わると、次に開いたとき位置がずれる
  window.addEventListener(
    "resize",
    () => {
      if (dialog.open) scrollToSlide(current, "instant");
    },
    { signal },
  );

  signal.addEventListener("abort", () => dialog.close(), { once: true });
};
