export const WRITING_STATUS = {
  WRITING: "writing",
  PLANNED: "planned",
  TODO: "todo",
  ON_HOLD: "on_hold",
  DONE: "done",
} as const;

export const WRITING_STATUS_LABELS = {
  [WRITING_STATUS.WRITING]: "執筆中",
  [WRITING_STATUS.PLANNED]: "執筆予定",
  [WRITING_STATUS.TODO]: "未着手",
  [WRITING_STATUS.ON_HOLD]: "保留",
  [WRITING_STATUS.DONE]: "執筆完了",
} as const;

export const WRITING_STATUS_ORDER = {
  [WRITING_STATUS.WRITING]: 0,
  [WRITING_STATUS.PLANNED]: 1,
  [WRITING_STATUS.TODO]: 2,
  [WRITING_STATUS.ON_HOLD]: 3,
  [WRITING_STATUS.DONE]: 4,
} as const;

export type WritingStatus =
  (typeof WRITING_STATUS)[keyof typeof WRITING_STATUS];
