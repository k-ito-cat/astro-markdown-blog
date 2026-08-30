import { pruneImages } from "../../scripts/prune-images.mjs";

/**
 * dev サーバーの起動時に、どの記事からも参照されていない画像を削除する。
 *
 * 記事の保存時に削除すると、Astro が生成済みのアセットマップ
 * （.astro/content-assets.mjs）がまだその画像を import している状態で
 * 解決が走り ImageNotFound になる。起動時はアセットマップが必ず作り直されるため、
 * この窓に落ちない。
 *
 * @see scripts/prune-images.mjs
 */
export default function imagePruner() {
  return {
    name: "image-pruner",
    apply: "serve",
    async configureServer(server) {
      try {
        const removed = await pruneImages(server.config.root);
        if (removed.length === 0) return;

        server.config.logger.info(
          `[image-pruner] 未参照の画像 ${removed.length} 件を削除: ${removed.join(", ")}`,
        );
      } catch (error) {
        // 掃除に失敗しても dev サーバーは起動させる
        server.config.logger.warn(
          `[image-pruner] 未参照画像の削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
