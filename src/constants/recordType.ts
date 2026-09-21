// MEMO: 記録の「型」の正本。frontmatter のバリデーション（src/content.config.ts）に適用される。
//
// 型は記録の性格を表す。公開状態（status）・執筆工程（writingStatus）とは別の概念で、
// 読み手が「この記録をどう読めばよいか」を判断するために置く。
export const RECORD_TYPE = {
  RESEARCH: "research",
  PRACTICE: "practice",
  VERIFICATION: "verification",
  THOUGHT: "thought",
  IMPRESSION: "impression",
} as const;

export const RECORD_TYPE_LABELS = {
  [RECORD_TYPE.RESEARCH]: "調査",
  [RECORD_TYPE.PRACTICE]: "実践",
  [RECORD_TYPE.VERIFICATION]: "検証",
  [RECORD_TYPE.THOUGHT]: "思考",
  [RECORD_TYPE.IMPRESSION]: "感想",
} as const;

/*
 * 型の定義。読み手に対する含意をそのまま文にしてある。
 * UI ではこの文をラベルの説明として出すので、書き換えると表示も変わる
 */
export const RECORD_TYPE_DESCRIPTIONS = {
  [RECORD_TYPE.RESEARCH]: "一次情報や仕様を調べて理解をまとめた記録",
  [RECORD_TYPE.PRACTICE]: "自分の環境で実際に作った、導入した記録",
  [RECORD_TYPE.VERIFICATION]: "自分で動かして確かめた記録",
  [RECORD_TYPE.THOUGHT]: "正解のない問いへの考察と個人的な主張",
  [RECORD_TYPE.IMPRESSION]: "読んだ本、使ったツールの紹介",
} as const;

export const RECORD_TYPE_ORDER = {
  [RECORD_TYPE.RESEARCH]: 0,
  [RECORD_TYPE.PRACTICE]: 1,
  [RECORD_TYPE.VERIFICATION]: 2,
  [RECORD_TYPE.THOUGHT]: 3,
  [RECORD_TYPE.IMPRESSION]: 4,
} as const;

export type RecordType = (typeof RECORD_TYPE)[keyof typeof RECORD_TYPE];
