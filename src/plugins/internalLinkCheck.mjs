import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 記事から記事へのリンクが、実在するページと見出しを指しているかをビルド後に確かめる。
 *
 * 見出しの id は文言から作られるので、見出しを書き換えると他の記事からの
 * `/blog/<slug>#<見出し>` が黙って切れる。非公開の記事はページ自体が作られない。
 * rehype は記事を 1 本ずつ処理し他の記事を見られないため、出来上がった HTML を
 * 突き合わせる。id を自前で計算しないので、Astro の振り方とずれない。
 *
 * 切れたリンクを残したまま公開しないよう、見つけたらビルドを失敗させる。
 */

const LINK_HREF = /<a\s[^>]*?href="([^"]*)"/g;
const ELEMENT_ID = /\sid="([^"]*)"/g;

const ENTITIES = {
  "&amp;": "&",
  "&#38;": "&",
  "&quot;": '"',
  "&#34;": '"',
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

const decodeAttribute = (value) =>
  value.replace(/&(?:amp|quot|lt|gt|#38|#34|#39);/g, (entity) => ENTITIES[entity]);

/** `blog/foo/index.html` → `/blog/foo`、`404.html` → `/404` */
const toPagePath = (file) => {
  const withoutExt = file.split(path.sep).join("/").replace(/\.html$/, "");
  const withoutIndex = withoutExt.replace(/(^|\/)index$/, "");
  return `/${withoutIndex}`;
};

const normalizePath = (pathname) => pathname.replace(/\/+$/, "") || "/";

const readPages = async (dir) => {
  const files = (await readdir(dir, { recursive: true })).filter((file) =>
    file.endsWith(".html"),
  );

  return Promise.all(
    files.map(async (file) => ({
      path: toPagePath(file),
      html: await readFile(path.join(dir, file), "utf8"),
    })),
  );
};

/** 切れていれば理由を返す。確かめる対象でないリンクと、切れていないリンクは null */
const findBreak = (href, site, idsByPage) => {
  // サイト外や解釈できない href は、この確認の対象外
  if (!URL.canParse(href, site)) return null;

  const url = new URL(href, site);
  if (url.origin !== site.origin || !url.pathname.startsWith("/blog/")) {
    return null;
  }

  let pagePath;
  let id;
  try {
    pagePath = normalizePath(decodeURIComponent(url.pathname));
    id = decodeURIComponent(url.hash.slice(1));
  } catch {
    return "URL の符号化が壊れています";
  }

  const ids = idsByPage.get(pagePath);
  if (!ids) return "ページがありません（非公開の記事を含む）";
  if (id && !ids.has(id)) return "見出しがありません";
  return null;
};

export default function internalLinkCheck() {
  let site;

  return {
    name: "internal-link-check",
    hooks: {
      "astro:config:done": ({ config }) => {
        site = config.site ? new URL(config.site) : undefined;
      },
      "astro:build:done": async ({ dir, logger }) => {
        if (!site) {
          throw new Error(
            "site が未設定のため、記事間リンクを確かめられません",
          );
        }

        const pages = await readPages(fileURLToPath(dir));
        const idsByPage = new Map(
          pages.map((page) => [
            normalizePath(page.path),
            new Set(
              [...page.html.matchAll(ELEMENT_ID)].map(([, id]) =>
                decodeAttribute(id),
              ),
            ),
          ]),
        );

        const breaks = pages.flatMap((page) =>
          [...page.html.matchAll(LINK_HREF)].flatMap(([, raw]) => {
            const href = decodeAttribute(raw);
            const reason = findBreak(href, site, idsByPage);
            return reason ? [`${page.path} → ${href}: ${reason}`] : [];
          }),
        );

        if (breaks.length > 0) {
          throw new Error(
            `切れた記事間リンクが ${breaks.length} 本あります\n${breaks.join("\n")}`,
          );
        }

        logger.info("記事間リンクはすべて実在するページと見出しを指しています");
      },
    },
  };
}
