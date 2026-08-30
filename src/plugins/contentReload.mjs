import path from "node:path";

const POSTS_DIR = "src/content/posts";
const POST_EXTENSIONS = [".md", ".mdx"];

/**
 * 記事を保存すると、dev サーバーは 2 回ページを再読み込みする。
 *
 * 1 回目は `astro:hmr-reload` が「SSR 専用モジュールが変わった」として送るもので、
 * コンテンツの再同期より前に走るため、必ず更新前の内容が描画される。
 * 2 回目はデータストアの更新を検知した `invalidateDataStore` が送るもので、
 * こちらが更新後の内容になる。
 *
 * 1 回目は記事の変更に対しては常に無駄なので落とす。`astro:hmr-reload` は
 * `enforce: "post"` で後に走るため、先にここで対象を空にすれば送信されない。
 *
 * @see node_modules/astro/dist/vite-plugin-hmr-reload/index.js
 * @see node_modules/astro/dist/content/vite-plugin-content-virtual-mod.js
 */
export default function contentReload() {
  let postsDir = "";

  return {
    name: "content-reload",
    apply: "serve",
    configResolved(config) {
      postsDir = path.resolve(config.root, POSTS_DIR);
    },
    hotUpdate({ file }) {
      if (!file.startsWith(`${postsDir}${path.sep}`)) return;
      if (!POST_EXTENSIONS.includes(path.extname(file))) return;

      return [];
    },
  };
}
