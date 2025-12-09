import { z, defineCollection } from "astro:content";
import { CATEGORIES } from "~/constants/categories";
import { PUBLISHED_STATUS } from "~/constants/publishedStatus";

const posts = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    // FIXME: 必須にしたいが、optionalにしないとすべてのフロントマターslugを入力していてもバリエーションエラーになってしまうので一時的にoptionalにする
    slug: z.string().optional(),
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
  }),
});

export const collections = { posts };
