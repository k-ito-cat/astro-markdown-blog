/**
 * 上ヘッダの表で、見出しの末尾の `{…}` を列の指定として読む。
 *
 *   | 記法 {nowrap} | 意味 {40%} | 回数 {4em} |
 *
 * 日本語は任意の位置で折り返せるため、長文の列に押されて短い列が潰れる。
 * 書き手が列ごとに折り返しと幅を決められるようにする。
 *
 * 生 HTML の表（左ヘッダ）は rehype-raw より前のこの時点では raw ノードの
 * ままなので対象外。左ヘッダは列の上に見出しが無く、指定を書く場所も無い。
 */
const SPEC_PATTERN = /\s*\{([^{}]*)\}\s*$/;
const NOWRAP_CLASS = "table-col-nowrap";

/** 読めない語が1つでもあれば null を返し、見出しを書き換えない */
const parseSpec = (source) => {
  const spec = { nowrap: false, width: null, minWidth: null };
  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  for (const token of tokens) {
    if (token === "nowrap") spec.nowrap = true;
    else if (/^\d+(\.\d+)?%$/.test(token)) spec.width = token;
    else if (/^\d+(\.\d+)?em$/.test(token)) spec.minWidth = token;
    else return null;
  }
  return spec;
};

/** 見出しの最後の文字列から指定を取り出し、指定の部分を消す */
const takeSpec = (th) => {
  const last = th.children.at(-1);
  if (last?.type !== "text") return null;

  const match = last.value.match(SPEC_PATTERN);
  if (!match) return null;

  const spec = parseSpec(match[1]);
  if (!spec) return null;

  last.value = last.value.slice(0, match.index);
  return spec;
};

const childElements = (node, tagName) =>
  (node?.children ?? []).filter(
    (child) => child.type === "element" && child.tagName === tagName,
  );

const addClass = (node, className) => {
  const current = node.properties.className ?? [];
  node.properties.className = [...current, className];
};

const addStyle = (node, declaration) => {
  const current = node.properties.style;
  node.properties.style = current ? `${current}; ${declaration}` : declaration;
};

const applyTable = (table) => {
  const [thead] = childElements(table, "thead");
  const [headRow] = childElements(thead, "tr");
  if (!headRow) return;

  const rows = [
    headRow,
    ...childElements(table, "tbody").flatMap((tbody) =>
      childElements(tbody, "tr"),
    ),
  ];

  childElements(headRow, "th").forEach((th, column) => {
    const spec = takeSpec(th);
    if (!spec) return;

    // 列の幅は列の中の最大の指定で決まるため、見出しのセルに持たせれば足りる
    if (spec.width) addStyle(th, `width: ${spec.width}`);
    if (spec.minWidth) addStyle(th, `min-width: ${spec.minWidth}`);

    if (!spec.nowrap) return;
    for (const row of rows) {
      const cell = row.children.filter((child) => child.type === "element")[
        column
      ];
      if (cell) addClass(cell, NOWRAP_CLASS);
    }
  });
};

const walk = (node) => {
  for (const child of node.children ?? []) {
    if (child.type !== "element") continue;

    if (child.tagName === "table") applyTable(child);
    else walk(child);
  }
};

export default function rehypeTableColumns() {
  return (tree) => walk(tree);
}
