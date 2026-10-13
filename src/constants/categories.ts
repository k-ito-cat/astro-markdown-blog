// MEMO: このファイルがカテゴリの正本。frontmatter のバリデーション（src/content.config.ts）に適用される。
//
// カテゴリは「記事を辿るための分野」。1記事あたり1〜2件まで。
// 技術名・製品名・個別の論点は CATEGORIES ではなく TAGS（src/constants/tags.ts）で表す。
// 「暮らし」は技術の外にある、道具の使い方や生活習慣の記録（Notion 活用、SNS との距離の取り方など）。
export const CATEGORIES = [
  "フロントエンド",
  "バックエンド",
  "Web基盤",
  "セキュリティ",
  "設計・アーキテクチャ",
  "開発環境・ツール",
  "AI",
  "UI・UX",
  "開発プロセス",
  "暮らし",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const MAX_CATEGORIES_PER_POST = 2;
