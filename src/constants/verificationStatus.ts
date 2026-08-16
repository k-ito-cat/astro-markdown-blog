export const VERIFICATION_STATUS = {
  IN_PROGRESS: "in_progress",
  VERIFIED: "verified",
  NEEDS_REVIEW: "needs_review",
} as const;

export type VerificationStatus =
  (typeof VERIFICATION_STATUS)[keyof typeof VERIFICATION_STATUS];

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  [VERIFICATION_STATUS.IN_PROGRESS]: "検証中",
  [VERIFICATION_STATUS.VERIFIED]: "検証済",
  [VERIFICATION_STATUS.NEEDS_REVIEW]: "要再検証",
};
