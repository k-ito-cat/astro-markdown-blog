export const PUBLISHED_STATUS = {
  PRIVATE: "private",
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type PublishedStatus = (typeof PUBLISHED_STATUS)[keyof typeof PUBLISHED_STATUS];