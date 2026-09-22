import {
  createMarkdownProcessor,
  isUnifiedProcessor,
} from "@astrojs/markdown-remark";

const ENDPOINT = "/__syntax-preview";
const MAX_SNIPPETS = 100;
const MAX_SNIPPET_LENGTH = 20_000;

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_SNIPPETS * MAX_SNIPPET_LENGTH) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const prefixIds = (html, index) => {
  const prefix = `syntax-preview-${index}-`;

  return html
    .replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}${id}"`)
    .replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${prefix}${id}"`)
    .replace(
      /\baria-describedby="([^"]+)"/g,
      (_, ids) =>
        `aria-describedby="${ids
          .split(/\s+/)
          .map((id) => `${prefix}${id}`)
          .join(" ")}"`,
    );
};

const sendJson = (response, status, value) => {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(value));
};

/** 記法ヘルプの表示例を、記事本文と同じ Markdown 設定で描画する。 */
export default function syntaxPreview() {
  let processorOptions;
  let markdownOptions;

  return {
    name: "syntax-preview",
    hooks: {
      "astro:config:setup": ({ command, config, logger }) => {
        if (command !== "dev") return;

        const processor = config.markdown?.processor;
        if (!processor || !isUnifiedProcessor(processor)) {
          logger.warn(
            "markdown.processor が unified() ではないため、記法の表示例を無効にします",
          );
          return;
        }

        // この integration は Expressive Code の直後に置く。配列を複製し、後続の
        // blockRange が足す編集専用プラグインを表示例へ混ぜないようにする。
        processorOptions = {
          ...processor.options,
          remarkPlugins: [...processor.options.remarkPlugins],
          rehypePlugins: [...processor.options.rehypePlugins],
        };
        markdownOptions = {
          syntaxHighlight: config.markdown.syntaxHighlight,
          shikiConfig: config.markdown.shikiConfig,
          gfm: config.markdown.gfm,
          smartypants: config.markdown.smartypants,
          image: config.image,
        };
      },

      "astro:server:setup": async ({ server, logger }) => {
        if (!processorOptions || !markdownOptions) return;

        const renderer = await createMarkdownProcessor({
          ...markdownOptions,
          ...processorOptions,
        });

        server.middlewares.use(ENDPOINT, async (request, response, next) => {
          if (request.method !== "POST") {
            next();
            return;
          }

          try {
            const value = JSON.parse(await readBody(request));
            const snippets = value?.snippets;
            if (
              !Array.isArray(snippets) ||
              snippets.length > MAX_SNIPPETS ||
              snippets.some(
                (snippet) =>
                  typeof snippet !== "string" ||
                  snippet.length > MAX_SNIPPET_LENGTH,
              )
            ) {
              sendJson(response, 400, { error: "Invalid snippets" });
              return;
            }

            const rendered = await Promise.all(
              snippets.map((snippet) =>
                renderer.render(snippet, {
                  frontmatter: { status: "private" },
                }),
              ),
            );
            sendJson(response, 200, {
              html: rendered.map(({ code }, index) => prefixIds(code, index)),
            });
          } catch (error) {
            logger.error(`記法の表示例を描画できませんでした: ${error}`);
            if (!response.headersSent) {
              sendJson(response, 500, { error: "Failed to render snippets" });
            }
          }
        });
      },
    },
  };
}
