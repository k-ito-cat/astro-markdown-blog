import { isUnifiedProcessor } from "@astrojs/markdown-remark";

/**
 * プレビューのインライン編集用に、描画済みのトップレベル要素へ原文の範囲を刻む。
 *
 * 位置情報は mdast にしかなく、リンクカードやコードブロックのようにノードを作り直す
 * プラグインを通ると失われる。そのため変換前の木から位置だけを控えておき、
 * rehype の最後でトップレベル要素へ出現順に割り当てる。
 */
/*
 * 脚注の定義は原文ではトップレベルに並ぶが、描画時は本文から外され、末尾の
 * 1 つの section へまとめられる。数が合わなくなるので、両側から外して数える。
 * 定義そのものは本文の編集対象にしない
 */
const isFootnoteDefinition = (node) => node.type === "footnoteDefinition";

const isFootnoteSection = (node) =>
  node.type === "element" && node.properties?.dataFootnotes !== undefined;

const collectBlockOffsets = () => (tree, file) => {
  file.data.blockOffsets = tree.children
    .filter((node) => !isFootnoteDefinition(node))
    .map((node) =>
      node.position
        ? [node.position.start.offset, node.position.end.offset]
        : null,
    );
};

/* dev 専用の仕組みなので、諦めた理由はその場で出す。黙って無効になると原因を追えない */
const giveUp = (file, reason) => {
  console.warn(
    `[block-range] ${file.path ?? "(unknown)"}: ${reason}。インライン編集を無効にします`,
  );
};

const stampBlockRanges = () => (tree, file) => {
  const offsets = file.data.blockOffsets;
  if (!Array.isArray(offsets)) {
    giveUp(file, "原文の位置を取得できていません");
    return;
  }
  if (offsets.some((offset) => offset === null)) {
    const missing = offsets.filter((offset) => offset === null).length;
    giveUp(file, `位置を持たないブロックが ${missing} 個あります`);
    return;
  }

  // 生 HTML とリンクカードは rehype-raw より前のこの時点では raw ノードのまま。
  // 属性は持てないが、原文ブロックとの対応を保つため数には入れる。
  const blocks = tree.children.filter(
    (node) =>
      (node.type === "element" || node.type === "raw") &&
      !isFootnoteSection(node),
  );
  // 個数が合わないまま範囲を割り当てると、部分書き込みが本文を壊す。
  if (blocks.length !== offsets.length) {
    giveUp(
      file,
      `原文 ${offsets.length} ブロックに対し描画は ${blocks.length} ブロック`,
    );
    return;
  }

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
