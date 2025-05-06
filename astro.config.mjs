// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import decapCmsOauth from "astro-decap-cms-oauth";
import netlify from "@astrojs/netlify";
import icon from "astro-icon";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: netlify(),
  vite: {
    plugins: [tailwindcss()],
  },
  experimental: {
    session: true,
  },
  integrations: [decapCmsOauth(),icon()],
});
