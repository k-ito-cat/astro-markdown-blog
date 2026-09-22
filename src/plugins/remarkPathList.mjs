/**
 * ファイル構成の箇条書きを、フォルダとファイルの icon で表す。
 *
 * `- src/` のように書いたとおりの形を見て種類を data 属性へ書き出し、見た目は
 * CSS 側で決める。`/` と拡張子は本文に残るので、icon が出ない環境でも読める。
 *
 * 種類を見るのは「`/` で終わる項目を 1 つ以上含む塊」だけに絞る。技術名を並べた
 * `- Node.js` のような箇条書きを、ファイルと取り違えないようにするため。
 */
const FOLDER = /^[^\s/]+(?:\/[^\s/]+)*\/$/;
const FILE = /^[^\s/]+(?:\/[^\s/]+)*\.[A-Za-z0-9]+$/;
const DETAILS_TAG = /<\/?details\b[^>]*>/gi;
const FOLDER_DETAILS =
  /\bdata-icon\s*=\s*(?:"folder"|'folder'|folder)(?=\s|>)/i;

/** 項目の見出しがパスだけで出来ているときに、その文字列を返す */
const pathTextOf = (item) => {
  // チェックリストは状態を表す別の記法なので触らない
  if (item.checked !== null && item.checked !== undefined) return null;

  const [paragraph] = item.children ?? [];
  if (paragraph?.type !== "paragraph" || paragraph.children?.length !== 1) {
    return null;
  }

  // path は等幅で書かれることもあるため、インラインコードも同じに扱う
  const [child] = paragraph.children;
  if (child.type !== "text" && child.type !== "inlineCode") return null;

  return child.value.trim();
};

const collectItems = (node, found = []) => {
  for (const child of node.children ?? []) {
    if (child.type === "listItem") found.push(child);
    collectItems(child, found);
  }
  return found;
};

const pathKindOf = (item) => {
  const text = pathTextOf(item);
  if (!text) return null;
  return FOLDER.test(text) ? "folder" : FILE.test(text) ? "file" : null;
};

/** 直下の全項目が path の ul だけに、専用の字下げを適用する印を付ける */
const markPathLists = (node) => {
  if (node.type === "list" && node.ordered !== true) {
    const items = node.children.filter((child) => child.type === "listItem");
    if (items.length > 0 && items.every((item) => pathKindOf(item))) {
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, "data-path-list": "" },
      };
    }
  }

  for (const child of node.children ?? []) markPathLists(child);
};

const markList = (list, insideFolderDetails = false) => {
  const items = collectItems(list).map((item) => ({
    item,
    text: pathTextOf(item),
  }));
  if (
    !insideFolderDetails &&
    !items.some(({ text }) => text && FOLDER.test(text))
  ) {
    return;
  }

  markPathLists(list);

  for (const { item, text } of items) {
    if (!text) continue;

    const kind = FOLDER.test(text) ? "folder" : FILE.test(text) ? "file" : null;
    if (!kind) continue;

    item.data = {
      ...item.data,
      hProperties: { ...item.data?.hProperties, "data-path-kind": kind },
    };
  }
};

const updateDetailsStack = (stack, html) => {
  for (const [tag] of html.matchAll(DETAILS_TAG)) {
    if (/^<\/details/i.test(tag)) stack.pop();
    else stack.push(FOLDER_DETAILS.test(tag));
  }
};

/** 入れ子のリストは外側の塊として一度に見て、HTML の details は兄弟順に追う */
const visitOuterLists = (node) => {
  const detailsStack = [];

  for (const child of node.children ?? []) {
    if (child.type === "html") {
      updateDetailsStack(detailsStack, child.value);
      continue;
    }

    if (child.type === "list") {
      markList(child, detailsStack.at(-1) === true);
      continue;
    }
    visitOuterLists(child);
  }
};

export default function remarkPathList() {
  return (tree) => visitOuterLists(tree);
}
