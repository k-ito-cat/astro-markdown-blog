// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@astrojs/netlify";
import icon from "astro-icon";
import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import astroExpressiveCode from "astro-expressive-code";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkGithubBlockquoteAlert],
  },
  integrations: [
    icon(),
    astroExpressiveCode({
      themes: ["andromeeda"],
    }),
  ],
});
