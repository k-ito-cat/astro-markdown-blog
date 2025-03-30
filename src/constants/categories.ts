export const CATEGORIES = ["Astro", "Astro Markdown", "hygen"] as const;
export type Category = (typeof CATEGORIES)[number];
