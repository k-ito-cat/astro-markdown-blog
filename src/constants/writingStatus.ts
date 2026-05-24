export const WRITING_STATUS = {
  WRITING: "writing",
  PLANNED_HIGH: "planned-high",
  PLANNED_MID: "planned-mid",
  TODO: "todo",
  DONE: "done",
} as const;

export type WritingStatus =
  (typeof WRITING_STATUS)[keyof typeof WRITING_STATUS];
