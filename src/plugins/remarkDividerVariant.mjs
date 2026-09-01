/**
 * 区切り線に用途を持たせる。
 *
 * CommonMark では `---` `***` `___` がどれも同じ thematicBreak になるため、
 * 原文の記号を見て種類を data 属性へ書き出し、見た目は CSS 側で決める。
 */
const VARIANTS = {
  "-": "section",
  "*": "chapter",
};

/**
 * `メモ ------------` のように、ラベルの後ろへ罫線を引いた行。
 * 見た目のとおりに書けるようにする。`--- ラベル ---` も同じ扱いにする。
 */
const LABELED_PATTERNS = [
  // 囲む形が先。後ろだけを見ると先頭の記号までラベルに含めてしまう
  /^-{3,}\s*(\S.*?)\s*-{3,}$/,
  /^(\S.*?)\s+-{3,}$/,
];

const visitThematicBreaks = (node, handle) => {
  if (node.type === "thematicBreak") {
    handle(node);
    return;
  }

  for (const child of node.children ?? []) visitThematicBreaks(child, handle);
};

/**
 * 段落として読まれる `--- ラベル ---` を、ラベル付きの区切りへ変える。
 * hr は中身を持てないため、separator の div として組み立てる。
 */
const convertLabeledDividers = (tree) => {
  for (const node of tree.children ?? []) {
    if (node.type !== "paragraph" || node.children?.length !== 1) continue;

    const [child] = node.children;
    if (child.type !== "text") continue;

    const text = child.value.trim();
    const matched = LABELED_PATTERNS.reduce(
      (found, pattern) => found ?? pattern.exec(text),
      null,
    );
    if (!matched) continue;

    const label = matched[1];
    child.value = label;
    node.data = {
      ...node.data,
      hName: "div",
      hProperties: {
        ...node.data?.hProperties,
        "data-divider": "labeled",
        role: "separator",
        "aria-label": label,
      },
    };
  }
};

export default function remarkDividerVariant() {
  return (tree, file) => {
    const source = String(file.value ?? "");

    convertLabeledDividers(tree);

    visitThematicBreaks(tree, (node) => {
      const start = node.position?.start?.offset;
      const end = node.position?.end?.offset;
      if (start === undefined || end === undefined) return;

      const variant = VARIANTS[source.slice(start, end).trim()[0]];
      if (!variant) return;

      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, "data-divider": variant },
      };
    });
  };
}
