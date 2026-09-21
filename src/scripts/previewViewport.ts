const DEFAULT_WIDTH = "390";

const initializeViewport = (host: HTMLElement) => {
  const dialog = host.querySelector("[data-viewport-dialog]");
  const frame = host.querySelector("[data-viewport-frame]");
  const open = host.querySelector("[data-viewport-open]");
  const close = host.querySelector("[data-viewport-close]");
  if (!(dialog instanceof HTMLDialogElement)) {
    throw new Error("Viewport dialog not found");
  }
  if (!(frame instanceof HTMLIFrameElement)) {
    throw new Error("Viewport frame not found");
  }
  if (!(open instanceof HTMLButtonElement)) {
    throw new Error("Viewport open button not found");
  }
  if (!(close instanceof HTMLButtonElement)) {
    throw new Error("Viewport close button not found");
  }

  const src = host.dataset.frameSrc;
  if (!src) throw new Error("Frame src not found");

  // 下書きは既定で猫のまま。公開後の見え方は明示的に選ばせる
  const body = host.querySelector<HTMLButtonElement>("[data-viewport-body]");
  let showsBody = false;

  const load = () => {
    // 静的ルートは query を受け取れないので、行き先そのものを切り替える
    frame.setAttribute("src", showsBody ? `${src}/content` : src);
  };

  const widths = Array.from(
    host.querySelectorAll<HTMLButtonElement>("[data-viewport-width]"),
  );

  /** 空文字は「実幅」。台の幅いっぱいまで伸ばす */
  const applyWidth = (value: string) => {
    frame.style.setProperty("--frame-width", value === "" ? "100%" : `${value}px`);
    widths.forEach((button) => {
      const pressed = button.dataset.viewportWidth === value;
      button.setAttribute("aria-pressed", String(pressed));
    });
  };

  widths.forEach((button) =>
    button.addEventListener("click", () =>
      applyWidth(button.dataset.viewportWidth ?? ""),
    ),
  );

  body?.addEventListener("click", () => {
    showsBody = !showsBody;
    body.setAttribute("aria-pressed", String(showsBody));
    body.textContent = showsBody ? "下書きの表示に戻す" : "下書きの本文を出す";
    load();
  });

  open.addEventListener("click", () => {
    // 開くまで読み込ませない。記事ページを開くたびに一本余計に走らせない
    if (!frame.getAttribute("src")) load();

    dialog.showModal();
    close.focus();
  });

  close.addEventListener("click", () => dialog.close());

  // 面の外を押したら閉じる。Escape は dialog の既定に任せる
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  applyWidth(DEFAULT_WIDTH);
};

export const initPreviewViewport = () => {
  document
    .querySelectorAll<HTMLElement>("preview-viewport")
    .forEach((host) => {
      try {
        initializeViewport(host);
      } catch (error) {
        console.error("[preview] 画面幅の確認の初期化に失敗しました", error);
      }
    });
};
