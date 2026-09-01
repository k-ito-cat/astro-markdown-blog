/**
 * プレビューの一覧で先頭に固定する記事の slug。
 *
 * 本番には出さないプレビュー限定の並びなので、frontmatter ではなくここで持つ。
 * 本番でもピン留めしたくなったら、frontmatter へ移してスキーマに載せる。
 */
export const PREVIEW_PINNED_SLUGS: readonly string[] = ["markdown-style-guide"];

export const isPreviewPinned = (slug: string) =>
  PREVIEW_PINNED_SLUGS.includes(slug);
