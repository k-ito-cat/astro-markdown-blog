/**
 * キャプション付きの画像を figure にする。
 *
 * `![alt](path "キャプション")` の title を figcaption へ移す。
 * alt は画像の内容説明、キャプションは読者への補足で役割が違うため、別々に持たせる。
 * title を持たない画像は今までどおり img のまま出す。
 */
const isOnlyImage = (node) =>
  node.type === "paragraph" &&
  node.children?.length === 1 &&
  node.children[0].type === "image";

export default function remarkImageFigure() {
  return (tree) => {
    for (const node of tree.children ?? []) {
      if (!isOnlyImage(node)) continue;

      const [image] = node.children;
      const caption = image.title?.trim();
      if (!caption) continue;

      // img の title は残すとツールチップが重複するので落とす
      image.title = null;

      node.data = {
        ...node.data,
        hName: "figure",
        hProperties: { ...node.data?.hProperties },
      };
      node.children = [
        image,
        {
          type: "paragraph",
          data: { hName: "figcaption" },
          children: [{ type: "text", value: caption }],
        },
      ];
    }
  };
}
