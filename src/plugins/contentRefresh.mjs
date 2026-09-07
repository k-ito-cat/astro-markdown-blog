import { setTimeout } from "node:timers/promises";

const ATTEMPTS = 5;
const INTERVAL_MS = 300;

let refresh = null;

/**
 * 記事を書いたあとに、コンテンツを取り込み直す。
 *
 * glob ローダーが監視で拾う経路は、最後のフル同期で作ったスキーマを使い続ける。
 * そのため `src/constants/tags.ts` を書き換えた直後の記事は、起動時の `TAGS` に
 * 無い値を持つことになり、検証に落ちてストアへ入らないまま握りつぶされる。
 * 定数を書き換えたときは、ここから取り込み直す必要がある。
 *
 * 対象は全体にする。`loaders` を渡すと、ローダーが登録済みの監視を外さないまま
 * 再登録するため、同じ変更を二重に拾うようになる。
 *
 * 取り込み直しは、そのとき読み込まれている設定をそのまま使う。設定の読み直しは
 * 記事ファイルの追加を監視が拾ってから走るため、書いた直後に呼ぶと古い `TAGS`
 * に当たり、足したばかりのタグを持つ記事が自分で検証に落ちる。読み直しが届く
 * まで少し待って試し直す。
 *
 * @see node_modules/astro/dist/content/content-layer.js #doSync
 */
export const refreshContent = async () => {
  if (refresh === null) {
    throw new Error("コンテンツを取り込み直す口が繋がっていません");
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      await refresh({});
      return;
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;

      await setTimeout(INTERVAL_MS);
    }
  }
};

/**
 * `refreshContent` は `astro:server:setup` が渡す公式の口で、読み直した設定から
 * スキーマを作り直す。dev サーバーでしか渡されない。
 *
 * @see node_modules/astro/dist/integrations/hooks.js runHookServerSetup
 */
export default function contentRefresh() {
  return {
    name: "content-refresh",
    hooks: {
      "astro:server:setup": ({ refreshContent: hook }) => {
        refresh = hook ?? null;
      },
    },
  };
}
