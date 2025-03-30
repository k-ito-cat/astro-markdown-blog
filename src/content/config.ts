import { z, defineCollection } from "astro:content";
import { CATEGORIES } from "~/constants/categories";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    categories: z.array(z.enum([...CATEGORIES])),
    eyecatchUrl: z.string().optional(),
    eyecatchAlt: z.string().optional(),
  }),
});

export const collections = { posts };
