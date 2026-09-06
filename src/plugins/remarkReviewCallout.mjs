/**
 * 添削用のコールアウト。
 *
 * `> [!REVIEW]`（一文単位の指摘）と `> [!OUTLINE]`（記事全体の構成の指摘）で
 * 始まる引用を、本文の注釈（GitHub Alert）とは別の器にする。
 * 添削は原稿へ一時的に書き込むものなので、本文の注意書きと同じ見た目にしない。
 * 消し忘れが本番へ出ないよう、公開記事のビルドでは節ごと落とす。
 */
const MARKER = /^\[!(REVIEW|OUTLINE)\]\s*/;

const leadingText = (blockquote) => {
  const [paragraph] = blockquote.children ?? [];
  if (paragraph?.type !== "paragraph") return null;

  const [text] = paragraph.children ?? [];
  return text?.type === "text" ? { paragraph, text } : null;
};

const markerOf = (blockquote) => {
  const leading = leadingText(blockquote);
  return leading ? MARKER.exec(leading.text.value)?.[1] : undefined;
};

/**
 * 目印の行を落とし、見出しの段落を先頭に足す。
 * 目印だけの行だったときは、続く改行ごと取り除く。
 */
const toCallout = (blockquote, kind) => {
  const { paragraph, text } = leadingText(blockquote);
  text.value = text.value.replace(MARKER, "");

  if (text.value === "") {
    const [, next] = paragraph.children;
    paragraph.children.splice(0, next?.type === "break" ? 2 : 1);
  }
  if (paragraph.children.length === 0) blockquote.children.shift();

  blockquote.data = {
    ...blockquote.data,
    hName: "div",
    hProperties: {
      ...blockquote.data?.hProperties,
      class: `markdown-alert markdown-alert-${kind.toLowerCase()}`,
      "data-review": kind.toLowerCase(),
    },
  };
  blockquote.children.unshift({
    type: "paragraph",
    data: {
      hName: "p",
      hProperties: { class: "markdown-alert-title" },
    },
    children: [{ type: "text", value: kind }],
  });
};

const convert = (parent, strip) => {
  const kept = [];

  for (const node of parent.children ?? []) {
    const kind = node.type === "blockquote" ? markerOf(node) : undefined;
    if (kind) {
      if (strip) continue;
      toCallout(node, kind);
      kept.push(node);
      continue;
    }

    if (node.children) convert(node, strip);
    kept.push(node);
  }

  parent.children = kept;
};

/**
 * @param {{ stripPublished?: boolean }} [options]
 *   stripPublished を立てると、`status: published` の記事から添削を取り除く。
 *   下書きとプレビューでは常に残す。
 */
export default function remarkReviewCallout(options = {}) {
  return (tree, file) => {
    const status = file.data?.astro?.frontmatter?.status;
    convert(tree, Boolean(options.stripPublished) && status === "published");
  };
}
