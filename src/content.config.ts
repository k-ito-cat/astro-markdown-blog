import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { CATEGORIES } from "~/constants/categories";
import { POST_PRIORITY } from "~/constants/postPriority";
import { PUBLISHED_STATUS } from "~/constants/publishedStatus";
import { WRITING_STATUS } from "~/constants/writingStatus";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    categories: z.array(z.enum([...CATEGORIES])),
    thumbnail: z.string().optional(),
    githubUrl: z.string().optional(),
    status: z.enum([
      PUBLISHED_STATUS.PRIVATE,
      PUBLISHED_STATUS.DRAFT,
      PUBLISHED_STATUS.PUBLISHED,
    ]),
    writingStatus: z.enum([
      WRITING_STATUS.WRITING,
      WRITING_STATUS.PLANNED,
      WRITING_STATUS.TODO,
      WRITING_STATUS.DONE,
    ]),
    priority: z.enum([
      POST_PRIORITY.HIGH,
      POST_PRIORITY.MEDIUM,
      POST_PRIORITY.LOW,
      POST_PRIORITY.NONE,
    ]),
  }),
});

export const collections = { posts };
