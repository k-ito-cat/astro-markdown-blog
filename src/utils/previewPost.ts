export type MemoState = "HAS_MEMO" | "EMPTY_MEMO" | "NO_MEMO" | "BROKEN_MEMO";

export const MEMO_STATE_LABELS: Record<MemoState, string> = {
  HAS_MEMO: "メモあり",
  EMPTY_MEMO: "空メモ",
  NO_MEMO: "メモなし",
  BROKEN_MEMO: "メモ不正",
};

export const MEMO_STATE_ORDER: Record<MemoState, number> = {
  BROKEN_MEMO: 0,
  HAS_MEMO: 1,
  EMPTY_MEMO: 2,
  NO_MEMO: 3,
};

export const normalizeSearchText = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja");
