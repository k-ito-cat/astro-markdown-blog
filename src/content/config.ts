import { z, defineCollection } from "astro:content";
import { object } from "astro:schema";
import { CATEGORIES } from "~/constants/categories";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    categories: z.array(z.enum([...CATEGORIES])),
    eyecatch: z
      .object({
        url: z.string(),
        alt: z.string(),
      })
      .optional(),
    githubUrl: z.string().optional(),
  }),
});

export const collections = { posts };
