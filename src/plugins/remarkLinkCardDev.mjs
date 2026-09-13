/**
 * dev 用の簡易リンクカード。
 *
 * 本番の remark-link-card-plus は本文の外部リンクごとに OGP を取りに行くため、
 * リンク 1 本あたり最大 10 秒かかる。dev では記事を保存するたびにそれが走って
 * 待たされるので外しているが、それだとカードの見た目が確認できない。
 *
 * ここでは取得を伴わないカードを組み立てる。本番で OGP を取れなかったときの
 * 出力（タイトルと表示 URL がホスト名、説明とサムネイルは空）と同じ形に
 * そろえてあるので、スタイルはそのまま当たる。
 *
 * 本番と見分けが付くよう、メタ行に断りを添える。クラスを持たせず親の
 * 文字色と大きさを継ぐので、追加のスタイルなしで控えめに出る。
 */

const CLASS_PREFIX = "remark-link-card-plus";

const className = (value) => `${CLASS_PREFIX}__${value}`;

/** 属性値と本文に落とすため、HTML として意味を持つ文字だけ潰す */
const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const toHttpUrl = (value) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

/**
 * 裸の URL だけで出来た段落か。
 * `[表示文字](別の URL)` のようにテキストを書き換えたリンクは、本文の流れで
 * 読ませたいものなのでカードにしない。本番側の判定に合わせている。
 */
const readBareUrl = (node) => {
  if (node.type !== "paragraph" || node.children?.length !== 1) return null;

  const [child] = node.children;

  if (child.type === "text") return toHttpUrl(child.value);

  if (child.type !== "link" || child.children?.length !== 1) return null;

  const [label] = child.children;
  if (label.type !== "text") return null;

  const url = toHttpUrl(child.url);
  if (!url) return null;

  return toHttpUrl(label.value)?.href === url.href ? url : null;
};

const buildCard = (url) => {
  const href = escapeHtml(url.toString());
  const host = escapeHtml(url.hostname);

  return `
<div class="${className("container")}">
  <a href="${href}" target="_blank" rel="noreferrer noopener" class="${className("card")}">
    <div class="${className("main")}">
  <div class="${className("content")}">
    <div class="${className("title")}">${host}</div>
    <div class="${className("description")}"></div>
  </div>
  <div class="${className("meta")}">
    <span class="${className("url")}">${host}</span>
    <span>開発モードの簡易表示</span>
  </div>
</div>
  </a>
</div>
`.trim();
};

export default function remarkLinkCardDev() {
  return (tree) => {
    tree.children = (tree.children ?? []).map((node) => {
      const url = readBareUrl(node);
      if (!url) return node;

      // 位置は blockRange が原文との対応を取るのに使う。段落 1 つを html 1 つへ
      // 置き換えるだけなのでブロック数は変わらないが、情報は引き継いでおく
      return { type: "html", value: buildCard(url), position: node.position };
    });
  };
}
