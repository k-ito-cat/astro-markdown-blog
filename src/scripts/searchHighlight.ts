/**
 * ヒットの位置を拾って塗る。探すページと記事内で同じものを使う。
 *
 * CSS Custom Highlight API へ Range を渡すだけなので、DOM は書き換えない。
 * 用語の注釈や脚注など、要素に依存する他の script と食い合わない。
 * 未対応のブラウザでは色が付かないだけで、絞り込みと移動はそのまま動く。
 */
import { toMarkTerms } from "~/utils/search";

/**
 * 本文ではあるが読み上げ用で、探す対象ではないもの。
 *
 * メモは外さない。公開前に書き手が消すもので、消し忘れはプレビューの警告が
 * 受け持つ。書いている本人にとっては自分の覚書も探したい対象になる
 */
export const SKIP_SELECTOR = "script, style, .sr-only";

export type Occurrence = {
  node: Text;
  /** node の中での位置。塗る検索は NFKC を掛けないので元テキストと揃う */
  at: number;
  length: number;
};

export const supportsHighlight = () =>
  typeof CSS !== "undefined" && "highlights" in CSS;

/**
 * root の中から、語のどれかに当たる箇所を文書順で拾う。
 * 語は空白区切りの AND で、当たった語はすべて拾う。
 */
export const findOccurrences = (
  root: HTMLElement,
  query: string,
  skip = SKIP_SELECTOR,
): Occurrence[] => {
  const terms = toMarkTerms(query);
  if (terms.length === 0) return [];

  const found: Occurrence[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || parent.closest(skip)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const haystack = (node.nodeValue ?? "").toLowerCase();
    const inNode: Occurrence[] = [];

    terms.forEach((term) => {
      let from = 0;
      for (;;) {
        const at = haystack.indexOf(term, from);
        if (at < 0) break;
        inNode.push({ node, at, length: term.length });
        from = at + term.length;
      }
    });

    // 語ごとに拾ったので、同じ node の中は位置の順に並べ直す
    inNode.sort((a, b) => a.at - b.at);
    found.push(...inNode);
  }

  return found;
};

export const toRange = (occurrence: Occurrence) => {
  const range = document.createRange();
  range.setStart(occurrence.node, occurrence.at);
  range.setEnd(occurrence.node, occurrence.at + occurrence.length);
  return range;
};

/** name の塗りを置き換える。空なら消す */
export const paintHighlight = (name: string, ranges: Range[]) => {
  if (!supportsHighlight()) return;
  if (ranges.length === 0) {
    CSS.highlights.delete(name);
    return;
  }
  CSS.highlights.set(name, new Highlight(...ranges));
};
