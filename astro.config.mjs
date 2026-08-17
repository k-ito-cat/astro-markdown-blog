import { defineConfig } from "astro/config";
import { unified } from "@astrojs/markdown-remark";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";

import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import remarkLinkCardPlus from "remark-link-card-plus";
import rehypeExternalLinks, {
  remarkExternalLinksInHtml,
} from "./src/plugins/rehypeExternalLinks.mjs";

import astroExpressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
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
  ],
});
