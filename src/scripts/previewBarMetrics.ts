/**
 * 追従する編集バーの実高を CSS 変数として配る。
 *
 * 狭幅では目次がこのバーの直下に吸着する。バーの高さは段組みの切り替わりや
 * 保存メッセージの表示で変わるため、固定値で見込むと必ずどこかでずれる。
 * 実測を流し込み、吸着位置をバーの高さに追従させる。
 */
export function initPreviewBarMetrics() {
  const bar = document.querySelector<HTMLElement>(".body-editor-bar");
  if (!bar) return;

  const root = document.documentElement;

  const publish = () => {
    const height = Math.round(bar.getBoundingClientRect().height);
    root.style.setProperty("--preview-editor-bar-height", `${height}px`);
  };

  publish();
  new ResizeObserver(publish).observe(bar);
}
