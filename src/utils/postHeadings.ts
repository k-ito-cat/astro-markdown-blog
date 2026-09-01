import { HEADING_LEVEL } from "~/constants/headingLevel";
import { MEMO_HEADING_TEXT } from "~/utils/postMemo.js";

type Heading = { depth: number; slug: string; text: string };

// メモは `## メモ` から本文末尾まで。見出し自体は移動先として残し、配下の見出しだけ目次から外す
export const stripMemoHeadings = (headings: Heading[]): Heading[] => {
  const memoIndex = headings.findIndex(
    (heading) =>
      heading.depth === HEADING_LEVEL.TWO &&
      heading.text.trim() === MEMO_HEADING_TEXT,
  );

  return memoIndex === -1 ? headings : headings.slice(0, memoIndex + 1);
};
