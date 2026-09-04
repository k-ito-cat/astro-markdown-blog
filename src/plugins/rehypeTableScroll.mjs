/**
 * 表を横スクロールできる器で包む。
 *
 * table 自身に overflow を持たせる（display: block 化する）方法は、
 * 日本語のように任意の位置で折り返せる本文だと列が縮んで収まってしまい、
 * 狭い画面でスクロールが発生しない。器を分け、表側に最小幅を持たせる。
 *
 * 生 HTML の table は rehype-raw より前のこの時点では raw ノードのままなので、
 * ここでは包めない。そちらは従来どおりのスタイルで扱う。
 */
const WRAPPER_CLASS = "prose-table";

const wrap = (node) => ({
  type: "element",
  tagName: "div",
  properties: { className: [WRAPPER_CLASS] },
  children: [node],
});

const walk = (parent) => {
  if (!Array.isArray(parent.children)) return;

  parent.children = parent.children.map((node) => {
    if (node.type !== "element") return node;

    walk(node);
    return node.tagName === "table" ? wrap(node) : node;
  });
};

export default function rehypeTableScroll() {
  return (tree) => walk(tree);
}
