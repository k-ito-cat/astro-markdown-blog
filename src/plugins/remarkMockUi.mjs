/**
 * 言語名を mock にしたコードブロックを、UIプレビュー（CMP-017）に組み替える。
 *
 * 書いた HTML と CSS は宣言的 Shadow DOM の中に描き、本文のスタイルと混ぜない。
 * 「UIプレビュー」「コード」のタブで切り替える。コードは html のコードブロックに
 * 差し替えるだけにし、描画は通常のコードブロックと同じ仕組みに任せる。
 *
 * タブを動かすのは JS（scripts/mockUi.ts）。JS が動かない間はタブを出さず、
 * 2 つのパネルを上下に並べて両方読めるようにするので、ここでは hidden を付けない。
 *
 * 宣言的 Shadow DOM は HTML の構文解析でだけ働く。innerHTML で差し込む表示例
 * （記法ヘルプ）は setHTMLUnsafe で入れる必要がある。
 */
const LANG = "mock";

// ```mock caption="…" の形で、ブロックの下に置く説明を受け取る
const CAPTION_PATTERN = /caption="([^"]*)"/;

const PANELS = [
  { key: "preview", label: "UIプレビュー" },
  { key: "code", label: "コード" },
];

const element = (hName, hProperties, children = []) => ({
  type: "mockUi",
  data: { hName, hProperties },
  children,
});

const text = (value) => ({ type: "text", value });

const toMockUi = (code, index) => {
  // 1 記事に複数置けるよう、記事の中での出現順で id を分ける
  const id = (key) => `mock-ui-${index}-${key}`;

  const tabs = element(
    "div",
    { className: ["mock-ui-tabs"], role: "tablist", ariaLabel: "UIプレビュー" },
    PANELS.map(({ key, label }, panelIndex) =>
      element(
        "button",
        {
          type: "button",
          role: "tab",
          id: id(`${key}-tab`),
          ariaControls: id(key),
          ariaSelected: String(panelIndex === 0),
          tabIndex: panelIndex === 0 ? 0 : -1,
          dataMockTab: key,
        },
        [text(label)],
      ),
    ),
  );

  const panel = (key, className, children) =>
    element(
      "div",
      {
        className: [className],
        role: "tabpanel",
        id: id(key),
        ariaLabelledBy: id(`${key}-tab`),
        dataMockPanel: key,
      },
      children,
    );

  const caption = code.meta?.match(CAPTION_PATTERN)?.[1]?.trim();

  return element("figure", { className: ["mock-ui"], dataMockUi: "" }, [
    tabs,
    panel("preview", "mock-ui-stage", [
      {
        type: "html",
        value: `<template shadowrootmode="open">${code.value}</template>`,
      },
    ]),
    panel("code", "mock-ui-code", [
      { type: "code", lang: "html", meta: null, value: code.value },
    ]),
    ...(caption ? [element("figcaption", {}, [text(caption)])] : []),
  ]);
};

export default function remarkMockUi() {
  return (tree) => {
    let count = 0;

    const walk = (parent) => {
      if (!Array.isArray(parent.children)) return;

      parent.children = parent.children.map((node) => {
        if (node.type === "code" && node.lang === LANG) {
          count += 1;
          return toMockUi(node, count);
        }
        walk(node);
        return node;
      });
    };

    walk(tree);
  };
}
