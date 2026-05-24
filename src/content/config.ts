import { z, defineCollection } from "astro:content";
import { CATEGORIES } from "~/constants/categories";
import { PUBLISHED_STATUS } from "~/constants/publishedStatus";
import { WRITING_STATUS } from "~/constants/writingStatus";

const posts = defineCollection({
  type: "content",
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
      WRITING_STATUS.PLANNED_HIGH,
      WRITING_STATUS.PLANNED_MID,
      WRITING_STATUS.TODO,
      WRITING_STATUS.DONE,
    ]),
  }),
});

export const collections = { posts };
