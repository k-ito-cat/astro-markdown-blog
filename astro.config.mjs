import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";

import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import remarkLinkCardPlus from "remark-link-card-plus";
import rehypeExternalLinks, {
  remarkExternalLinksInHtml,
} from "./src/plugins/rehypeExternalLinks.mjs";
import frontmatterEditor from "./src/plugins/frontmatterEditor.mjs";
import bodyEditor from "./src/plugins/bodyEditor.mjs";
import imageUploader from "./src/plugins/imageUploader.mjs";
import contentReload from "./src/plugins/contentReload.mjs";
import postManager from "./src/plugins/postManager.mjs";
import blockRange from "./src/plugins/blockRange.mjs";

import astroExpressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
  output: "static",
  image: {
    // Markdown 内の画像にも srcset / sizes を自動付与する
    layout: "constrained",
  },
  vite: {
    plugins: [
      tailwindcss(),
      frontmatterEditor(),
      bodyEditor(),
      imageUploader(),
      contentReload(),
      postManager(),
    ],
  },
  markdown: {
    processor: unified({
      remarkPlugins: [
        remarkGithubBlockquoteAlert,
        [remarkLinkCardPlus, { noFavicon: true }],
        [
          remarkExternalLinksInHtml,
          { internalHosts: ["k-ito-blog.netlify.app"] },
        ],
      ],
      rehypePlugins: [
        [rehypeExternalLinks, { internalHosts: ["k-ito-blog.netlify.app"] }],
      ],
    }),
  },
  integrations: [
    icon(),
    astroExpressiveCode({
      themes: ["github-dark"],
      styleOverrides: {
        codeBackground: "var(--color-code-bg)",
        borderRadius: "2px",
        borderColor: "var(--border)",
      },
    }),
    // expressive-code の後に置くこと。rehype プラグインを最後に走らせる必要がある
    blockRange(),
  ],
});
