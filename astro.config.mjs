// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import decapCmsOauth from "astro-decap-cms-oauth";
// https://astro.build/config
export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [decapCmsOauth()],
});
