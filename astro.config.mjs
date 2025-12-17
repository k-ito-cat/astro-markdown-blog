// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import netlify from "@astrojs/netlify";
import icon from "astro-icon";
import remarkGithubBlockquoteAlert from "remark-github-blockquote-alert";
import rehypeRaw from "rehype-raw";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkGithubBlockquoteAlert],
    rehypePlugins: [rehypeRaw],
    remarkRehype: {
      allowDangerousHtml: true,
    },
  },
  integrations: [icon()],
});
