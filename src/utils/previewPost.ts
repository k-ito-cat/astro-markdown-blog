import { POST_PRIORITY, type PostPriority } from "~/constants/postPriority";
import {
  PUBLISHED_STATUS,
  type PublishedStatus,
} from "~/constants/publishedStatus";
import { WRITING_STATUS, type WritingStatus } from "~/constants/writingStatus";

export type MemoState = "HAS_MEMO" | "EMPTY_MEMO" | "NO_MEMO" | "BROKEN_MEMO";

type PreviewPostState = {
  status: PublishedStatus;
  writingStatus: WritingStatus;
  priority: PostPriority;
  memoState: MemoState;
};

export const getPreviewPostIssues = ({
  status,
  writingStatus,
  priority,
  memoState,
}: PreviewPostState) => {
  const issues: string[] = [];

  if (memoState === "BROKEN_MEMO") {
    issues.push("メモ見出しが複数あります");
  }
  if (status === PUBLISHED_STATUS.PUBLISHED && memoState !== "NO_MEMO") {
    issues.push("公開済み記事にメモが残っています");
  }
  if (
    status === PUBLISHED_STATUS.PUBLISHED &&
    writingStatus !== WRITING_STATUS.DONE
  ) {
    issues.push("公開済みですが執筆完了ではありません");
  }
  if (
    status === PUBLISHED_STATUS.DRAFT &&
    (writingStatus === WRITING_STATUS.TODO ||
      writingStatus === WRITING_STATUS.PLANNED)
  ) {
    issues.push("未着手または執筆予定の記事が公開されています");
  }
  if (
    (writingStatus === WRITING_STATUS.WRITING ||
      writingStatus === WRITING_STATUS.PLANNED) &&
    priority === POST_PRIORITY.NONE
  ) {
    issues.push("作業対象の優先度が未設定です");
  }
  if (memoState === "EMPTY_MEMO") {
    issues.push("空のメモ欄が残っています");
  }
  if (
    writingStatus === WRITING_STATUS.DONE &&
    status === PUBLISHED_STATUS.DRAFT
  ) {
    issues.push("執筆完了した記事がWIP公開のままです");
  }

  return issues;
};
