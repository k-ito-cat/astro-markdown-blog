import { z, defineCollection } from "astro:content";
import { CATEGORIES } from "~/constants/categories";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    categories: z.array(z.enum([...CATEGORIES])),
    thumbnail: z
      .string()
      .optional(),
    githubUrl: z.string().optional(),
    isPublished: z.boolean().default(false),
  }),
});

export const collections = { posts };
