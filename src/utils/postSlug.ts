const BLOG_PREFIX = "blog/";

export const normalizePostSlug = (slug: string) =>
  slug.startsWith(BLOG_PREFIX) ? slug.slice(BLOG_PREFIX.length) : slug;

export const resolvePostEntrySlug = (slug: string) =>
  slug.startsWith(BLOG_PREFIX) ? slug : `${BLOG_PREFIX}${slug}`;
