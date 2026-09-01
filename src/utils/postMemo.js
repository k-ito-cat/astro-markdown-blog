export const MEMO_STATE = {
  HAS_MEMO: "HAS_MEMO",
  EMPTY_MEMO: "EMPTY_MEMO",
  NO_MEMO: "NO_MEMO",
  BROKEN_MEMO: "BROKEN_MEMO",
};

export const MEMO_HEADING_TEXT = "メモ";

const MEMO_HEADING_PATTERN = /^## メモ\s*$/gm;

export const detectMemoState = (content) => {
  const matches = [...content.matchAll(MEMO_HEADING_PATTERN)];

  if (matches.length === 0) return MEMO_STATE.NO_MEMO;
  if (matches.length > 1) return MEMO_STATE.BROKEN_MEMO;

  const memoStartIndex = matches[0].index + matches[0][0].length;
  const memo = content.slice(memoStartIndex);
  return memo.trim().length > 0 ? MEMO_STATE.HAS_MEMO : MEMO_STATE.EMPTY_MEMO;
};
