// MEMO: public/admin/config.yml で管理画面上で選択できるカテゴリを記述しているので、
// あまりやりたくないが二重管理する（このファイルのカテゴリはスキーマに適用するための定数なので管理画面で表示されるものとは関係ない）
//
// カテゴリは「記事を辿るための分野」。1記事あたり1〜2件まで。
// 技術名・製品名・個別の論点は CATEGORIES ではなく TAGS（src/constants/tags.ts）で表す。
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
] as const;
export type Category = (typeof CATEGORIES)[number];

export const MAX_CATEGORIES_PER_POST = 2;
