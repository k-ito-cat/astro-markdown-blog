import { TAG_YOMI } from "~/constants/tags";

/*
 * タグを頭文字で束ねる。ラテン文字は a〜z、日本語は五十音の行で引けるようにし、
 * 読みを持たない語（記号や数字で始まるもの）だけ最後へ送る
 */

type TagCount = readonly [string, number];

export type TagInitialGroup = {
  /** 見出しに出す文字。ラテンは大文字、日本語は行の代表文字 */
  initial: string;
  tags: TagCount[];
};

/* 濁点・半濁点・小書きは清音と同じ行として扱う */
const KANA_ROWS: readonly (readonly [string, string])[] = [
  ["あ", "あいうえおぁぃぅぇぉ"],
  ["か", "かきくけこがぎぐげご"],
  ["さ", "さしすせそざじずぜぞ"],
  ["た", "たちつてとだぢづでどっ"],
  ["な", "なにぬねの"],
  ["は", "はひふへほばびぶべぼぱぴぷぺぽ"],
  ["ま", "まみむめも"],
  ["や", "やゆよゃゅょ"],
  ["ら", "らりるれろ"],
  ["わ", "わゐゑをんゎ"],
];

const DIGIT_INITIAL = "0–9";
const OTHER_INITIAL = "その他";

const toHiragana = (text: string) =>
  text.replace(/[ァ-ヶ]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60),
  );

/** 並べ替えの基準になる読み。漢字は正本の読み、それ以外は表記から作る */
const readingOf = (tag: string) => {
  const yomi = (TAG_YOMI as Record<string, string | undefined>)[tag];
  return toHiragana((yomi ?? tag).toLocaleLowerCase("ja"));
};

const initialOf = (reading: string) => {
  const head = reading.slice(0, 1);
  if (/[a-z]/.test(head)) return head.toUpperCase();
  if (/[0-9]/.test(head)) return DIGIT_INITIAL;

  const row = KANA_ROWS.find(([, members]) => members.includes(head));
  return row ? row[0] : OTHER_INITIAL;
};

/* A〜Z、五十音の行、数字、その他の順に置く */
const initialRank = (initial: string) => {
  if (/[A-Z]/.test(initial)) return initial.charCodeAt(0) - 65;
  if (initial === DIGIT_INITIAL) return 26 + KANA_ROWS.length;
  if (initial === OTHER_INITIAL) return 27 + KANA_ROWS.length;

  return 26 + KANA_ROWS.findIndex(([label]) => label === initial);
};

/** 頭文字ごとに束ね、a〜z、五十音の行、その他の順で返す */
export const groupTagsByInitial = (
  counts: readonly TagCount[],
): TagInitialGroup[] => {
  const groups = new Map<string, TagCount[]>();

  counts
    .map((entry) => ({ entry, reading: readingOf(entry[0]) }))
    .sort((a, b) => a.reading.localeCompare(b.reading, "ja"))
    .forEach(({ entry, reading }) => {
      const initial = initialOf(reading);
      const group = groups.get(initial);
      if (group) group.push(entry);
      else groups.set(initial, [entry]);
    });

  return Array.from(groups, ([initial, tags]) => ({ initial, tags })).sort(
    (a, b) => initialRank(a.initial) - initialRank(b.initial),
  );
};
