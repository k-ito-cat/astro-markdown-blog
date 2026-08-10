export const POST_PRIORITY = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
  NONE: "none",
} as const;

export const POST_PRIORITY_LABELS = {
  [POST_PRIORITY.HIGH]: "高",
  [POST_PRIORITY.MEDIUM]: "中",
  [POST_PRIORITY.LOW]: "低",
  [POST_PRIORITY.NONE]: "未設定",
} as const;

export const POST_PRIORITY_ORDER = {
  [POST_PRIORITY.HIGH]: 0,
  [POST_PRIORITY.MEDIUM]: 1,
  [POST_PRIORITY.LOW]: 2,
  [POST_PRIORITY.NONE]: 3,
} as const;

export type PostPriority = (typeof POST_PRIORITY)[keyof typeof POST_PRIORITY];
