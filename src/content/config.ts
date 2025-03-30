import { z, defineCollection } from "astro:content";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    categories: z.array(z.string()).optional(),
    eyecatchUrl: z.string().optional(),
    eyecatchAlt: z.string().optional(),
  }),
});

export const collections = { posts };
