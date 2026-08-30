import { isUnifiedProcessor } from "@astrojs/markdown-remark";

/**
 * プレビューのインライン編集用に、描画済みのトップレベル要素へ原文の範囲を刻む。
 *
 * 位置情報は mdast にしかなく、リンクカードやコードブロックのようにノードを作り直す
 * プラグインを通ると失われる。そのため変換前の木から位置だけを控えておき、
 * rehype の最後でトップレベル要素へ出現順に割り当てる。
 */
const collectBlockOffsets = () => (tree, file) => {
  file.data.blockOffsets = tree.children.map((node) =>
    node.position
      ? [node.position.start.offset, node.position.end.offset]
      : null,
  );
};

const stampBlockRanges = () => (tree, file) => {
  const offsets = file.data.blockOffsets;
  if (!Array.isArray(offsets) || offsets.some((offset) => offset === null)) {
    return;
  }

  // 生 HTML とリンクカードは rehype-raw より前のこの時点では raw ノードのまま。
  // 属性は持てないが、原文ブロックとの対応を保つため数には入れる。
  const blocks = tree.children.filter(
    (node) => node.type === "element" || node.type === "raw",
  );
  // 個数が合わないまま範囲を割り当てると、部分書き込みが本文を壊す。
  if (blocks.length !== offsets.length) return;

  blocks.forEach((node, index) => {
    if (node.type !== "element") return;

    node.properties = {
      ...node.properties,
      "data-md-range": offsets[index].join("-"),
    };
  });

  // 並び替えと挿入では、属性を持てないブロック（リンクカードや生 HTML）の位置も要る
  tree.children.push({
    type: "element",
    tagName: "script",
    properties: { type: "application/json", "data-md-blocks": "" },
    children: [{ type: "text", value: JSON.stringify(offsets) }],
  });
};

export default function blockRange() {
  return {
    name: "block-range",
    hooks: {
      "astro:config:setup": ({ command, config, logger }) => {
        if (command !== "dev") return;

        const processor = config.markdown?.processor;
        if (!processor || !isUnifiedProcessor(processor)) {
          logger.warn(
            "markdown.processor が unified() ではないため、本文のインライン編集を無効にします",
          );
          return;
        }

        // 位置は変換前に取り、割り当ては全変換後に行う
        processor.options.remarkPlugins.unshift(collectBlockOffsets);
        processor.options.rehypePlugins.push(stampBlockRanges);
      },
    },
  };
}
