export const PUBLISHED_STATUS = {
  PRIVATE: "private",
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export const PUBLISHED_STATUS_LABELS = {
  [PUBLISHED_STATUS.DRAFT]: "公開中（WIP）",
  [PUBLISHED_STATUS.PRIVATE]: "非公開",
  [PUBLISHED_STATUS.PUBLISHED]: "公開済み",
} as const;

export const PUBLISHED_STATUS_ORDER = {
  [PUBLISHED_STATUS.DRAFT]: 0,
  [PUBLISHED_STATUS.PRIVATE]: 1,
  [PUBLISHED_STATUS.PUBLISHED]: 2,
} as const;

export type PublishedStatus =
  (typeof PUBLISHED_STATUS)[keyof typeof PUBLISHED_STATUS];
