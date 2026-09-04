import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import {
  appendTags,
  readTags,
  TagError,
  validateNewTags,
} from "./tagStore.mjs";

const ENDPOINT = "/__post";
const POSTS_DIR = "src/content/posts";
const BLOG_DIR = "src/content/posts/blog";
const TEMPLATE_PATH = "_templates/generator/new/index.ejs.t";
const POST_EXTENSIONS = [".md", ".mdx"];
const MAX_REQUEST_BYTES = 256 * 1024;
const BODY_MODES = ["body", "memo"];
const MEMO_HEADING = "## メモ";
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// hygen の frontmatter（to: 行）を落とし、本文テンプレートだけ取り出す
const HYGEN_HEADER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const FRONTMATTER_PATTERN = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new RequestError(413, "リクエストが大きすぎます"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

const resolveInBlog = (root, slug) => {
  const baseDir = path.resolve(root, BLOG_DIR);
  const filePath = path.resolve(baseDir, `${slug}.md`);
  if (!filePath.startsWith(`${baseDir}${path.sep}`)) return null;

  return filePath;
};

const readPosts = async (root) => {
  const postsDir = path.resolve(root, POSTS_DIR);
  const entries = await fs.readdir(postsDir, { recursive: true });
  const files = entries.filter((entry) =>
    POST_EXTENSIONS.includes(path.extname(entry)),
  );
  return Promise.all(
    files.map(async (entry) => ({
      entry,
      content: await fs.readFile(path.join(postsDir, entry), "utf8"),
    })),
  );
};

const loadOptions = async (server) => {
  const [categories, tags, published, writing, priority] = await Promise.all([
    server.ssrLoadModule("/src/constants/categories.ts"),
    readTags(server.config.root),
    server.ssrLoadModule("/src/constants/publishedStatus.ts"),
    server.ssrLoadModule("/src/constants/writingStatus.ts"),
    server.ssrLoadModule("/src/constants/postPriority.ts"),
  ]);
  return {
    categories: categories.CATEGORIES,
    maxCategories: categories.MAX_CATEGORIES_PER_POST,
    tags,
    status: Object.values(published.PUBLISHED_STATUS),
    writingStatus: Object.values(writing.WRITING_STATUS),
    priority: Object.values(priority.POST_PRIORITY),
  };
};

/**
 * hygen のテンプレートをそのまま使う。
 * 置換対象は既知のものだけで、式の評価はしない。
 * 未知の埋め込みが残ったらテンプレート側の変更なので、書かずに知らせる。
 *
 * categories と tags はスキーマが 1 件以上を要求するため、空のままだと
 * コンテンツの検証が落ちて dev サーバーが止まる。必ず値を入れる。
 */
const toYamlList = (values) =>
  `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** テンプレートの 1 行を、渡された値で差し替える */
const replaceField = (source, key, value) =>
  source.replace(
    new RegExp(`^${key}: .*$`, "m"),
    `${key}: ${JSON.stringify(value)}`,
  );

const buildContent = async (
  root,
  { title, categories, tags, fields, body, bodyMode },
) => {
  const templatePath = path.resolve(root, TEMPLATE_PATH);
  const template = await fs.readFile(templatePath, "utf8").catch(() => null);
  if (template === null) {
    throw new RequestError(
      500,
      `テンプレートが見つかりません: ${TEMPLATE_PATH}`,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  let filled = template
    .replace(HYGEN_HEADER, "")
    .replaceAll("<%= title %>", title)
    .replaceAll('<%= new Date().toISOString().split("T")[0] %>', today)
    .replace(/^categories: \[\]$/m, `categories: ${toYamlList(categories)}`)
    .replace(/^tags: \[\]$/m, `tags: ${toYamlList(tags)}`)
    // hygen ヘッダーを外した跡の空行を落とす。この後の ^ 判定に効く
    .trimStart();

  // 指定のあった項目だけ、テンプレートの既定値から差し替える
  for (const [key, value] of Object.entries(fields)) {
    filled = replaceField(filled, key, value);
  }

  if (filled.includes("<%")) {
    throw new RequestError(
      500,
      "テンプレートに未対応の埋め込みがあります。postManager の置換規則を更新してください",
    );
  }
  if (filled.includes("categories: []") || filled.includes("tags: []")) {
    throw new RequestError(
      500,
      "テンプレートの categories / tags を埋められませんでした",
    );
  }

  // CLI 向けの手引きコメントは UI から作る場合には不要。
  // 本文の見出しも # で始まるため、除去はフロントマターの中だけに限る
  const match = FRONTMATTER_PATTERN.exec(filled);
  if (!match) throw new RequestError(500, "テンプレートの形式が不正です");

  const frontmatter = match[2]
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

  // 入力があれば、テンプレートの本文（"ここに本文を書く" と メモ 見出し）は使わない
  const written =
    body === ""
      ? filled.slice(match[0].length).trimEnd()
      : bodyMode === "memo"
        ? `\n\n${MEMO_HEADING}\n\n${body}`
        : `\n\n${body}`;
  return `${match[1]}${frontmatter}${match[3]}${written}\n`;
};

/** 選択肢に無い値と件数違反を弾く。フロントマターの検証で dev サーバーを止めないため */
const validateChoices = (values, allowed, { min, max, label }) => {
  if (!Array.isArray(values) || values.length < min) {
    throw new RequestError(400, `${label}を${min}件以上選んでください`);
  }
  if (values.length > max) {
    throw new RequestError(400, `${label}は${max}件までです`);
  }
  if (new Set(values).size !== values.length) {
    throw new RequestError(400, `${label}が重複しています`);
  }
  if (values.some((value) => !allowed.includes(value))) {
    throw new RequestError(400, `${label}に未登録の値が含まれています`);
  }
  return values;
};

const createPost = async (
  server,
  { slug, title, categories, tags, newTags, fields, body, bodyMode },
) => {
  const { root } = server.config;
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new RequestError(
      400,
      "slug は英小文字・数字・ハイフンで指定してください",
    );
  }
  if (typeof title !== "string" || title.trim() === "") {
    throw new RequestError(400, "タイトルは必須です");
  }

  const options = await loadOptions(server);
  // 新しいタグは記事より先に定数へ入れる。ここで通れば以降の検証も通る
  const added = validateNewTags(newTags, options.tags);
  const allowedTags = [...options.tags, ...added];
  // 追加したタグは、この記事に付けるために足したもの。必ず記事側へ入れる
  const selectedTags = Array.isArray(tags)
    ? [...tags, ...added.filter((tag) => !tags.includes(tag))]
    : tags;

  validateChoices(categories, options.categories, {
    min: 1,
    max: options.maxCategories,
    label: "カテゴリ",
  });
  validateChoices(selectedTags, allowedTags, {
    min: 1,
    max: allowedTags.length,
    label: "タグ",
  });

  const filePath = resolveInBlog(root, slug);
  if (!filePath) throw new RequestError(400, "slug が不正です");

  const exists = await fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
  if (exists) throw new RequestError(409, `既に存在します: ${slug}.md`);

  const written = {};
  if (fields !== undefined) {
    if (
      fields === null ||
      typeof fields !== "object" ||
      Array.isArray(fields)
    ) {
      throw new RequestError(400, "フロントマターの形式が不正です");
    }

    for (const [key, spec] of Object.entries({
      publishedAt: { kind: "date", label: "公開日" },
      updatedAt: { kind: "date", label: "更新日" },
      thumbnail: { kind: "text", label: "サムネイル" },
      githubUrl: { kind: "text", label: "GitHub URL" },
      status: { kind: "choice", label: "公開状態" },
      writingStatus: { kind: "choice", label: "執筆状態" },
      priority: { kind: "choice", label: "優先度" },
    })) {
      const value = fields[key];
      if (value === undefined) continue;
      if (typeof value !== "string") {
        throw new RequestError(400, `${spec.label}の形式が不正です`);
      }
      if (spec.kind === "date" && !DATE_PATTERN.test(value)) {
        throw new RequestError(
          400,
          `${spec.label}は YYYY-MM-DD で指定してください`,
        );
      }
      if (spec.kind === "choice" && !options[key].includes(value)) {
        throw new RequestError(400, `${spec.label}を選んでください`);
      }

      written[key] = value;
    }
  }

  if (body !== undefined && typeof body !== "string") {
    throw new RequestError(400, "本文の形式が不正です");
  }
  if (bodyMode !== undefined && !BODY_MODES.includes(bodyMode)) {
    throw new RequestError(400, "本文の扱いが不正です");
  }

  await appendTags(root, added);
  const content = await buildContent(root, {
    title: title.trim(),
    categories,
    tags: selectedTags,
    fields: written,
    body: (body ?? "").trim(),
    bodyMode: bodyMode ?? "body",
  });
  await fs.writeFile(filePath, content, "utf8");
  return { slug, addedTags: added };
};

/** 消した記事を指したままの記録を探す。相対リンク・絶対URL・relations を一度に見る */
const findReferences = async (root, slug) => {
  const posts = await readPosts(root);
  const patterns = [
    new RegExp(`\\]\\(/blog/${slug}[/#)]`),
    new RegExp(`/blog/${slug}(?:[/#"'\\s)]|$)`, "m"),
    new RegExp(`^\\s*-\\s*"?(?:blog/)?${slug}"?\\s*$`, "m"),
  ];

  return posts
    .filter(({ entry }) => entry !== `blog/${slug}.md`)
    .filter(({ content }) => patterns.some((pattern) => pattern.test(content)))
    .map(({ entry }) => entry);
};

const renamePost = async (root, { slug, nextSlug }) => {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new RequestError(400, "slug が不正です");
  }
  if (typeof nextSlug !== "string" || !SLUG_PATTERN.test(nextSlug)) {
    throw new RequestError(
      400,
      "slug は英小文字・数字・ハイフンで指定してください",
    );
  }
  if (slug === nextSlug) throw new RequestError(400, "slug が変わっていません");

  const filePath = resolveInBlog(root, slug);
  const nextPath = resolveInBlog(root, nextSlug);
  if (!filePath || !nextPath) throw new RequestError(400, "slug が不正です");

  const exists = await fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) throw new RequestError(404, "対象の記事が見つかりません");

  const taken = await fs
    .stat(nextPath)
    .then(() => true)
    .catch(() => false);
  if (taken) throw new RequestError(409, `既に存在します: ${nextSlug}.md`);

  // 参照は旧 slug で探すため、名前を変える前に集める
  const references = await findReferences(root, slug);
  await fs.rename(filePath, nextPath);
  return { slug: nextSlug, references };
};

const deletePost = async (root, { slug }) => {
  if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
    throw new RequestError(400, "slug が不正です");
  }

  const filePath = resolveInBlog(root, slug);
  if (!filePath) throw new RequestError(400, "slug が不正です");

  const exists = await fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) throw new RequestError(404, "対象の記事が見つかりません");

  const references = await findReferences(root, slug);
  await fs.rm(filePath, { force: true });
  return { slug, references };
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const createHandler = (server) =>
  async function devPostManager(request, response) {
    try {
      if (request.method !== "POST") {
        throw new RequestError(405, "POST のみ受け付けます");
      }

      let payload;
      try {
        payload = JSON.parse(await readRequestBody(request));
      } catch (error) {
        if (error instanceof RequestError) throw error;
        throw new RequestError(400, "リクエストの JSON を解析できません");
      }
      if (
        payload === null ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      ) {
        throw new RequestError(400, "リクエストの形式が不正です");
      }

      if (payload.action === "create") {
        sendJson(response, 200, await createPost(server, payload));
        return;
      }
      if (payload.action === "rename") {
        sendJson(response, 200, await renamePost(server.config.root, payload));
        return;
      }
      if (payload.action === "delete") {
        sendJson(response, 200, await deletePost(server.config.root, payload));
        return;
      }
      throw new RequestError(
        400,
        `未対応の操作です: ${String(payload.action)}`,
      );
    } catch (error) {
      if (error instanceof RequestError || error instanceof TagError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }
      server.config.logger.error(
        `[post-manager] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      sendJson(response, 500, { message: "記事の操作に失敗しました" });
    }
  };

export default function postManager() {
  return {
    name: "post-manager",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, createHandler(server));
    },
  };
}
