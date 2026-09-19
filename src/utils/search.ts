/**
 * 検索語の扱い。索引、記事内、プレビューの3か所で同じ約束にする。
 *
 * 正規化は2種類ある。絞り込みだけなら NFKC を掛けて表記ゆれを吸収できるが、
 * NFKC は文字数を変える（半角カナ、丸数字など）ため、ヒットを塗る検索では
 * 元のテキストと位置がずれる。塗る側は小文字化だけに留める。
 */

/** 絞り込みの突き合わせ用。位置には使えない */
export const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja");

/** 空白区切りの AND。絞り込み用 */
export const toTerms = (query: string) =>
  normalizeSearchText(query).split(/\s+/u).filter(Boolean);

/** ヒットを塗る検索用。元のテキストと文字数が揃う */
export const foldCase = (value: string) => value.toLowerCase();

/** 空白区切りの AND。塗る検索用 */
export const toMarkTerms = (query: string) =>
  foldCase(query).split(/\s+/u).filter(Boolean);
