import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@astrojs/netlify";
import icon from "astro-icon";

import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import remarkLinkCardPlus from "remark-link-card-plus";

import astroExpressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [
      remarkGithubBlockquoteAlert,
      [remarkLinkCardPlus, { noFavicon: true }],
    ],
  },
  integrations: [
    icon(),
    astroExpressiveCode({
      themes: ["andromeeda"],
    }),
  ],
});
