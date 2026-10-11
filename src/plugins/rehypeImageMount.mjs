/**
 * 本文に単独で置いた画像を台紙で包む（CMP-015）。
 *
 * 台紙が本文幅と枠線を持ち、画像は自然な大きさのまま中に置く。縦横比の違いで
 * 出る余白は、何もない帯ではなく台紙の面として見せる。
 *
 * 段落の中に置くので、器は phrasing content の span にする。
 */
const MOUNT_CLASS = "prose-image-mount";

const isImage = (node) => node.type === "element" && node.tagName === "img";

const isBlank = (node) => node.type === "text" && node.value.trim() === "";

const mount = (image) => ({
  type: "element",
  tagName: "span",
  properties: { className: [MOUNT_CLASS] },
  children: [image],
});

// 段落は画像だけのとき、figure は remarkImageFigure が作ったクラスなしのものだけ
const holdsStandaloneImage = (node) => {
  if (node.tagName === "p") {
    const content = node.children.filter((child) => !isBlank(child));
    return content.length === 1 && isImage(content[0]);
  }
  return node.tagName === "figure" && !node.properties?.className;
};

const walk = (parent) => {
  if (!Array.isArray(parent.children)) return;

  for (const node of parent.children) {
    if (node.type !== "element") continue;

    if (holdsStandaloneImage(node)) {
      node.children = node.children.map((child) =>
        isImage(child) ? mount(child) : child,
      );
      continue;
    }
    walk(node);
  }
};

export default function rehypeImageMount() {
  return (tree) => walk(tree);
}
