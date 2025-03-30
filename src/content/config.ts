import { z, defineCollection } from "astro:content";
import { CATEGORIES } from "~/constants/categories";
import { PUBLISHED_STATUS } from "~/constants/published-status";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    categories: z.array(z.enum([...CATEGORIES])),
    eyecatchUrl: z.string().optional(),
    eyecatchAlt: z.string().optional(),
    publishedStatus: z.enum(PUBLISHED_STATUS),
  }),
});

export const collections = { posts };
