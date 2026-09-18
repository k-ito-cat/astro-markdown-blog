/**
 * 用語の注釈。
 *
 * `?[用語][説明]` を、はてなマークを添えた語と吹き出しへ変える。記号を `?` と
 * 角括弧だけで組むのは、リンク `[]()`、画像 `![]()`、脚注 `[^]` のいずれとも
 * 衝突させないため。プラグインが無くても読める平文として残る形を選んでいる。
 *
 * 説明の中のリンクや `code` は remark が先に解釈し、`?[語][` と `]` の間が
 * 複数のノードへ割れている。そのため文字列を解析し直さず、開きと閉じの間に
 * ある兄弟ノードをそのまま包み直す。
 */

/** 用語側は素の文字だけを受ける。装飾を許すと閉じ括弧の判定が曖昧になる */
const OPENING = /\?\[([^[\]]+)\]\[/;

/** 用語の注釈を入れない場所。見出しは目次とアンカーに出るため対象外にする */
const SKIPPED_PARENTS = new Set(["heading", "link", "linkReference"]);

/**
 * 説明の終わりを探す。`[text](url)` は link ノードとして先に解釈済みなので、
 * ここへ現れる角括弧は本文として書かれたものだけ。対応を数えて外側で閉じる。
 */
const splitAtClosing = (value) => {
  let depth = 1;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "[") depth += 1;
    if (value[index] !== "]") continue;

    depth -= 1;
    if (depth === 0) {
      return { inside: value.slice(0, index), after: value.slice(index + 1) };
    }
  }

  return null;
};

const span = (className, children) => ({
  // mdast に inline の汎用ノードが無いため、hName を差し替えて span として出す
  type: "emphasis",
  data: { hName: "span", hProperties: { class: className } },
  children,
});

const toTerm = (word, description, id) => ({
  type: "emphasis",
  data: { hName: "span", hProperties: { class: "glossary-term" } },
  children: [
    span("glossary-term-word", [{ type: "text", value: word }]),
    {
      type: "emphasis",
      data: {
        hName: "button",
        hProperties: {
          type: "button",
          class: "glossary-term-mark",
          // popovertarget だけで開閉できる。script は hover と未対応環境を補う
          popovertarget: id,
          "aria-controls": id,
          "aria-expanded": "false",
          "aria-label": `${word}の説明`,
        },
      },
      children: [{ type: "text", value: "?" }],
    },
    {
      type: "emphasis",
      data: {
        hName: "span",
        hProperties: { id, popover: "auto", class: "glossary-term-bubble" },
      },
      children: description,
    },
  ],
});

/**
 * 1 つの親の中から用語を取り出す。閉じ括弧が見つからないときは記法として
 * 扱わず、書いたままの文字列を残す。
 */
const convert = (parent, counter) => {
  const source = parent.children;
  const converted = [];
  let index = 0;

  while (index < source.length) {
    const node = source[index];

    if (node.type !== "text") {
      converted.push(node);
      index += 1;
      continue;
    }

    const opened = OPENING.exec(node.value);
    if (!opened) {
      if (node.value !== "") converted.push(node);
      index += 1;
      continue;
    }

    const description = [];
    let rest = node.value.slice(opened.index + opened[0].length);
    let closing = splitAtClosing(rest);
    let cursor = index;

    // 閉じ括弧は後続のノードにある場合がある。見つかるまで説明へ取り込む
    while (!closing && cursor + 1 < source.length) {
      if (rest !== "") description.push({ type: "text", value: rest });
      cursor += 1;

      const next = source[cursor];
      if (next.type !== "text") {
        description.push(next);
        rest = "";
        continue;
      }

      rest = next.value;
      closing = splitAtClosing(rest);
    }

    if (!closing) {
      converted.push(node);
      index += 1;
      continue;
    }

    if (closing.inside !== "") {
      description.push({ type: "text", value: closing.inside });
    }
    if (opened.index > 0) {
      converted.push({
        type: "text",
        value: node.value.slice(0, opened.index),
      });
    }

    counter.count += 1;
    converted.push(
      toTerm(opened[1], description, `glossary-term-${counter.count}`),
    );

    // 閉じた後ろにもう 1 つ書かれていることがあるので、残りから読み直す
    source[cursor] = { type: "text", value: closing.after };
    index = cursor;
  }

  parent.children = converted;
};

const walk = (node, counter) => {
  if (!Array.isArray(node.children) || SKIPPED_PARENTS.has(node.type)) return;

  for (const child of node.children) walk(child, counter);
  convert(node, counter);
};

export default function remarkGlossaryTerm() {
  return (tree) => {
    walk(tree, { count: 0 });
  };
}
