import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const POSTS_DIR = "src/content/posts";
const IMAGES_DIR = "src/content/posts/images";
const POST_EXTENSIONS = [".md", ".mdx"];
const IMAGE_PREFIX = "../images/";
const IMAGE_REFERENCE = /\.\.\/images\/[\w.-]+(?:\/[\w.-]+)*/g;

/**
 * 記事本文から `../images/xxx.png` の参照を集める。
 * 画像は src/ 配下の相対参照だけが astro:assets の最適化対象になるため、
 * 参照の形式はこの1種類に限られる。
 */
const collectReferences = (source) =>
  (source.match(IMAGE_REFERENCE) ?? []).map((reference) =>
    reference.slice(IMAGE_PREFIX.length),
  );

const listFiles = async (dir) => {
  const entries = await fs.readdir(dir, {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)),
    );
};

/**
 * どの記事からも参照されていない画像を削除する。
 *
 * 保存のたびに削除すると、Astro が生成済みのアセットマップ（.astro/content-assets.mjs）が
 * まだその画像を import している状態で解決が走り ImageNotFound になる。
 * データストアの更新よりアセットマップの再生成が遅れるため、削除は
 * アセットマップが必ず作り直される dev サーバー起動時か、明示実行に限定する。
 *
 * 記事ごとの差分ではなく全記事を走査するので、記事の削除で孤児になった画像も拾う。
 */
export const pruneImages = async (root, { dryRun = false } = {}) => {
  const postsDir = path.resolve(root, POSTS_DIR);
  const imagesDir = path.resolve(root, IMAGES_DIR);

  const imageFiles = await listFiles(imagesDir).catch(() => null);
  if (imageFiles === null) return [];

  const postEntries = await fs.readdir(postsDir, {
    recursive: true,
    withFileTypes: true,
  });
  const sources = await Promise.all(
    postEntries
      .filter(
        (entry) =>
          entry.isFile() && POST_EXTENSIONS.includes(path.extname(entry.name)),
      )
      .map((entry) =>
        fs.readFile(path.join(entry.parentPath, entry.name), "utf8"),
      ),
  );

  const used = new Set(sources.flatMap(collectReferences));

  const removed = [];
  for (const relative of imageFiles) {
    if (used.has(relative)) continue;

    const filePath = path.resolve(imagesDir, relative);
    if (!filePath.startsWith(`${imagesDir}${path.sep}`)) continue;

    if (!dryRun) await fs.rm(filePath, { force: true });
    removed.push(relative);
  }
  return removed;
};

const isCli = process.argv[1]?.endsWith("prune-images.mjs");

if (isCli) {
  const dryRun = process.argv.includes("--dry-run");
  const removed = await pruneImages(process.cwd(), { dryRun });

  if (removed.length === 0) {
    console.log("未参照の画像はありません");
  } else {
    console.log(
      dryRun
        ? `未参照の画像 ${removed.length} 件（--dry-run のため削除していません）`
        : `未参照の画像 ${removed.length} 件を削除しました`,
    );
    for (const relative of removed) console.log(`  ${relative}`);
  }
}
