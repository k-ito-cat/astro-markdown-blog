import { z, defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { CATEGORIES, MAX_CATEGORIES_PER_POST } from "~/constants/categories";
import { TAGS } from "~/constants/tags";
import { POST_PRIORITY } from "~/constants/postPriority";
import { PUBLISHED_STATUS } from "~/constants/publishedStatus";
import { WRITING_STATUS } from "~/constants/writingStatus";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    categories: z
      .array(z.enum([...CATEGORIES]))
      .min(1)
      .max(MAX_CATEGORIES_PER_POST),
    tags: z.array(z.enum([...TAGS])).min(1),
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
      WRITING_STATUS.ON_HOLD,
      WRITING_STATUS.DONE,
    ]),
    priority: z.enum([
      POST_PRIORITY.HIGH,
      POST_PRIORITY.MEDIUM,
      POST_PRIORITY.LOW,
      POST_PRIORITY.NONE,
    ]),
    relations: z
      .object({
        prerequisites: z.array(z.string()).optional(),
        related: z.array(z.string()).optional(),
        developments: z.array(z.string()).optional(),
        replacements: z.array(z.string()).optional(),
      })
      .optional(),
    revisions: z
      .array(
        z.object({
          date: z.coerce.date(),
          summary: z.string(),
        }),
      )
      .optional(),
  }),
});

export const collections = { posts };
