import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readTags } from "./tagStore.mjs";

const ENDPOINT = "/__suggest";
const BLOG_DIR = "src/content/posts/blog";
const POSTS_DIR = "src/content/posts";
// 本文は長いほど生成が遅くなる（実測: 本文なし 13s / 800字 27s / 4000字 47s）
const MAX_BODY_LENGTH = 800;
const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const POST_EXTENSIONS = [".md", ".mdx"];
const MAX_REQUEST_BYTES = 8 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_INSTRUCTION_LENGTH = 500;
const MAX_CANDIDATES = 3;
const MAX_TAG_CANDIDATES = 5;
const MAX_NEW_TAG_CANDIDATES = 2;
const MAX_TAG_LENGTH = 40;
const MAX_TITLE_CANDIDATE_LENGTH = 120;
const CODE_FENCE = /^```(?:json)?\s*|\s*```$/g;
// 指示や本文が付くと生成が長引く（実測で最長 55 秒）。余裕を持たせる
const TIMEOUT_MS = 120 * 1000;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// 対話の 5 時間枠ではなく、プラン付帯の月次 Agent SDK クレジットから引かれる。
// Haiku 4.5 は effort を解釈せず thinking が伸びて 1 分近くかかる。
// Sonnet 5 + effort low なら thinking がほぼ出ず、実測 55 秒 → 4 秒になる
const MODEL = "claude-sonnet-5";
const EFFORT = "low";
const SYSTEM_PROMPT = [
  "You help an author create a new post for a Japanese tech blog.",
  "Reply with a single JSON object and nothing else. No prose, no code fences.",
  'Shape: {"titles": string[], "slugs": string[], "categories": string[], "tags": string[], "newTags": string[]}.',
  `titles: ${MAX_CANDIDATES} refined Japanese title candidates for the draft title.`,
  `slugs: ${MAX_CANDIDATES} URL slugs, lowercase ASCII letters, digits and hyphens only, under 60 characters.`,
  "Prefer the English technical terms that appear in the title for the slugs.",
  "categories and tags: pick only from the lists given by the user. Never invent new values.",
  "newTags: at most 2 tags that are missing from the list but clearly needed for this article. Leave it empty when the list is enough.",
  "When the article body is given, base categories and tags on what the body actually covers.",
  "Follow the author's extra instruction when one is given, but never break the rules above.",
].join(" ");

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

const loadOptions = async (server) => {
  const [categories, tags] = await Promise.all([
    server.ssrLoadModule("/src/constants/categories.ts"),
    readTags(server.config.root),
  ]);
  return {
    categories: categories.CATEGORIES,
    maxCategories: categories.MAX_CATEGORIES_PER_POST,
    tags,
  };
};

/** 本文は材料。読めなければ黙って諦め、タイトルだけで候補を出す */
const readBody = async (root, id) => {
  if (typeof id !== "string" || id === "" || id.includes("\0")) return "";

  const baseDir = path.resolve(root, POSTS_DIR);
  for (const extension of POST_EXTENSIONS) {
    const filePath = path.resolve(baseDir, `${id}${extension}`);
    if (!filePath.startsWith(`${baseDir}${path.sep}`)) continue;

    const source = await fs.readFile(filePath, "utf8").catch(() => null);
    if (source === null) continue;

    // 上限を切って、長い記事でも 1 回のコストが跳ねないようにする
    return source
      .replace(FRONTMATTER_PATTERN, "")
      .trim()
      .slice(0, MAX_BODY_LENGTH);
  }
  return "";
};

const readExistingSlugs = async (root) => {
  const baseDir = path.resolve(root, BLOG_DIR);
  const entries = await fs.readdir(baseDir).catch(() => []);
  return new Set(
    entries
      .filter((entry) => POST_EXTENSIONS.includes(path.extname(entry)))
      .map((entry) => path.basename(entry, path.extname(entry))),
  );
};

/**
 * ローカルの `claude` を非対話（-p）で 1 回だけ呼ぶ。
 *
 * - シェルを介さず引数配列で渡す。タイトルに何が入っても解釈されない
 * - `--bare` は使わない。認証が API キー固定になり、サブスク認証が使えなくなる
 * - cwd は一時ディレクトリ。プロジェクト直下だと CLAUDE.md が読み込まれ、
 *   無駄なトークンと余計な前置きが混ざる
 */
const runClaude = (prompt) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        prompt,
        "--model",
        MODEL,
        "--effort",
        EFFORT,
        "--restricted",
        // MCP サーバーの定義がプロンプトへ載ると、この用途には無縁な分だけ
        // 毎回 8,000 トークン以上を積むことになる。実測で費用と時間が半分になる
        "--strict-mcp-config",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--system-prompt",
        SYSTEM_PROMPT,
      ],
      { cwd: os.tmpdir(), stdio: ["ignore", "pipe", "pipe"] },
    );

    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new RequestError(504, "候補の生成が時間内に終わりませんでした"));
    }, TIMEOUT_MS);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new RequestError(
          503,
          error.code === "ENOENT"
            ? "claude コマンドが見つかりません"
            : `claude の実行に失敗しました: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const message = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new RequestError(
            503,
            message === ""
              ? `claude が異常終了しました (${code})`
              : `claude が異常終了しました: ${message}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
  });

const buildPrompt = ({ title, body, instruction, options }) => {
  const lines = [
    `下書きのタイトル: ${title}`,
    `選べるカテゴリ（1〜${options.maxCategories}件）: ${options.categories.join(", ")}`,
    `選べるタグ（3〜${MAX_TAG_CANDIDATES}件）: ${options.tags.join(", ")}`,
  ];
  if (instruction !== "") lines.push(`著者からの追加指示: ${instruction}`);
  if (body !== "") lines.push(`本文（冒頭）:\n${body}`);
  return lines.join("\n");
};

/** 選択肢に無い値を捨てる。ここを通ったものだけが UI に出る */
const pickAllowed = (values, allowed, limit) => {
  const picked = [];
  if (!Array.isArray(values)) return picked;

  for (const value of values) {
    if (typeof value !== "string") continue;
    if (!allowed.includes(value) || picked.includes(value)) continue;

    picked.push(value);
    if (picked.length >= limit) break;
  }
  return picked;
};

const pickTitles = (values) => {
  const picked = [];
  if (!Array.isArray(values)) return picked;

  for (const value of values) {
    if (typeof value !== "string") continue;

    const title = value.trim();
    if (title === "" || title.length > MAX_TITLE_CANDIDATE_LENGTH) continue;
    if (picked.includes(title)) continue;

    picked.push(title);
    if (picked.length >= MAX_CANDIDATES) break;
  }
  return picked;
};

const pickSlugs = (values, existing) => {
  const picked = [];
  if (!Array.isArray(values)) return picked;

  for (const value of values) {
    if (typeof value !== "string") continue;

    const slug = value.trim();
    if (!SLUG_PATTERN.test(slug)) continue;
    if (existing.has(slug) || picked.includes(slug)) continue;

    picked.push(slug);
    if (picked.length >= MAX_CANDIDATES) break;
  }
  return picked;
};

const suggest = async (server, payload) => {
  const { title } = payload;
  if (typeof title !== "string" || title.trim() === "") {
    throw new RequestError(400, "タイトルを入力してください");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new RequestError(400, "タイトルが長すぎます");
  }

  const [options, body] = await Promise.all([
    loadOptions(server),
    readBody(server.config.root, payload.id),
  ]);
  // 指示は材料の一つ。返り値の検証は指示の有無によらず同じものが働く
  const instruction =
    typeof payload.instruction === "string"
      ? payload.instruction.trim().slice(0, MAX_INSTRUCTION_LENGTH)
      : "";
  const output = await runClaude(
    buildPrompt({ title: title.trim(), body, instruction, options }),
  );

  let response;
  try {
    response = JSON.parse(output);
  } catch {
    throw new RequestError(502, "claude の応答を解析できません");
  }
  if (response?.is_error) {
    throw new RequestError(502, "claude が候補を返しませんでした");
  }

  // 1 回いくら使ったかを追えるようにする。残量を出す手段が無いため、ここが唯一の記録
  if (typeof response?.total_cost_usd === "number") {
    server.config.logger.info(
      `[create-suggester] $${response.total_cost_usd.toFixed(4)}`,
    );
  }

  let suggested;
  try {
    // コードフェンスで包まれて返ることがある。中身だけを取り出す
    suggested = JSON.parse(
      String(response?.result ?? "").replace(CODE_FENCE, ""),
    );
  } catch {
    throw new RequestError(502, "候補の形式が不正です");
  }

  /** 定数に無いものだけを、タグとして成立する形で返す */
  const pickNewTags = (values) => {
    const picked = [];
    if (!Array.isArray(values)) return picked;

    const known = new Set(options.tags.map((tag) => tag.toLowerCase()));
    for (const value of values) {
      if (typeof value !== "string") continue;

      const tag = value.trim();
      if (tag === "" || tag.length > MAX_TAG_LENGTH) continue;
      if (known.has(tag.toLowerCase())) continue;

      known.add(tag.toLowerCase());
      picked.push(tag);
      if (picked.length >= MAX_NEW_TAG_CANDIDATES) break;
    }
    return picked;
  };

  // モデルが何を返しても、そのまま使える値だけを通す
  const existing = await readExistingSlugs(server.config.root);
  return {
    newTags: pickNewTags(suggested?.newTags),
    titles: pickTitles(suggested?.titles),
    slugs: pickSlugs(suggested?.slugs, existing),
    categories: pickAllowed(
      suggested?.categories,
      options.categories,
      options.maxCategories,
    ),
    tags: pickAllowed(suggested?.tags, options.tags, MAX_TAG_CANDIDATES),
  };
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const createHandler = (server) =>
  async function devCreateSuggester(request, response) {
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

      sendJson(response, 200, await suggest(server, payload));
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }
      server.config.logger.error(
        `[create-suggester] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      sendJson(response, 500, { message: "候補の生成に失敗しました" });
    }
  };

export default function createSuggester() {
  return {
    name: "create-suggester",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, createHandler(server));
    },
  };
}
