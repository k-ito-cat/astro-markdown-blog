import type { CollectionEntry } from "astro:content";
import { PUBLISHED_STATUS } from "~/constants/publishedStatus";
import { normalizePostSlug } from "~/utils/postSlug";

// 関連記事は「共通タグ2点 + 共通カテゴリ1点」で採点する。
// カテゴリが1つ重なるだけ（=同じ分野というだけ）では関連として扱わない。
const TAG_SCORE = 2;
const CATEGORY_SCORE = 1;
const MIN_RELATION_SCORE = 2;
const RELATION_LIMIT = 3;

export type LinkedRecord = { slug: string; title: string };

export type RelationGroup = {
  label: string;
  description: string;
  records: LinkedRecord[];
};

export type PostRelations = {
  groups: RelationGroup[];
  sameField: LinkedRecord[];
  older?: LinkedRecord;
  newer?: LinkedRecord;
};

const toRecord = (entry: CollectionEntry<"posts">): LinkedRecord => ({
  slug: normalizePostSlug(entry.id),
  title: entry.data.title,
});

/**
 * 記録同士の関係をまとめて求める。
 * 記事ページとプレビューの両方から呼ぶため、採点規則をここに一本化する。
 */
export const getPostRelations = (
  post: CollectionEntry<"posts">,
  posts: CollectionEntry<"posts">[],
): PostRelations => {
  // 非公開の記録は関係の対象にしない
  const timeline = posts
    .filter((entry) => entry.data.status !== PUBLISHED_STATUS.PRIVATE)
    .sort(
      (a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime(),
    );
  const bySlug = new Map(
    timeline.map((entry) => [normalizePostSlug(entry.id), entry]),
  );

  const resolveRecords = (slugs?: string[]) =>
    (slugs ?? [])
      .map((slug) => bySlug.get(normalizePostSlug(slug)))
      .filter((entry): entry is CollectionEntry<"posts"> => Boolean(entry))
      .map(toRecord);

  const groups: RelationGroup[] = [
    {
      label: "この記録の前提",
      description: "先に理解しておくと、この記録を辿りやすくなります。",
      records: resolveRecords(post.data.relations?.prerequisites),
    },
    {
      label: "関連する記録",
      description: "同じ論点を別の位置から扱っています。",
      records: resolveRecords(post.data.relations?.related),
    },
    {
      label: "ここから続く記録",
      description: "この理解を前提に、先へ進めた記録です。",
      records: resolveRecords(post.data.relations?.developments),
    },
    {
      label: "この記録を置き換えたもの",
      description: "認識の更新により、現在はこちらを参照します。",
      records: resolveRecords(post.data.relations?.replacements),
    },
  ];

  const currentCategories = new Set<string>(post.data.categories);
  const currentTags = new Set<string>(post.data.tags);
  const sameField = timeline
    .filter((entry) => entry.id !== post.id)
    .map((entry) => ({
      entry,
      score:
        entry.data.tags.filter((tag) => currentTags.has(tag)).length *
          TAG_SCORE +
        entry.data.categories.filter((category) =>
          currentCategories.has(category),
        ).length *
          CATEGORY_SCORE,
    }))
    .filter(({ score }) => score >= MIN_RELATION_SCORE)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.entry.data.publishedAt.getTime() - a.entry.data.publishedAt.getTime(),
    )
    .slice(0, RELATION_LIMIT)
    .map(({ entry }) => toRecord(entry));

  const currentIndex = timeline.findIndex((entry) => entry.id === post.id);
  const newer = currentIndex > 0 ? timeline[currentIndex - 1] : undefined;
  const older =
    currentIndex >= 0 && currentIndex < timeline.length - 1
      ? timeline[currentIndex + 1]
      : undefined;

  return {
    groups,
    sameField,
    older: older && toRecord(older),
    newer: newer && toRecord(newer),
  };
};
