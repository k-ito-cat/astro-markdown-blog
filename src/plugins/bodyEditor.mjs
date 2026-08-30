import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "/__body";
const POSTS_DIR = "src/content/posts";
const POST_EXTENSIONS = [".md", ".mdx"];
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const FRONTMATTER_PATTERN = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const resolvePostPath = async (root, id) => {
  if (typeof id !== "string" || id === "" || id.includes("\0")) return null;

  const baseDir = path.resolve(root, POSTS_DIR);
  for (const extension of POST_EXTENSIONS) {
    const filePath = path.resolve(baseDir, `${id}${extension}`);
    if (!filePath.startsWith(`${baseDir}${path.sep}`)) continue;

    const stats = await fs.stat(filePath).catch(() => null);
    if (stats?.isFile()) return filePath;
  }
  return null;
};

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new RequestError(413, "リクエストが大きすぎます"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

/**
 * Astro が保持する本文は、フロントマターを除いて trim したもの。
 * 書き戻す位置を合わせるため、本文の開始位置を同じ手順で求める。
 * @see node_modules/astro/dist/vite-plugin-markdown/content-entry-type.js
 */
const getBodyStart = (source) => {
  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) throw new RequestError(422, "フロントマターが見つかりません");

  const rest = source.slice(match[0].length);
  return match[0].length + (rest.length - rest.trimStart().length);
};

const buildNextSource = (source, { body, expected }) => {
  const bodyStart = getBodyStart(source);
  const current = source.slice(bodyStart).trim();

  // 読み込み時点と一致しなければ書き込まない。
  // ここを省くと、外部で編集された本文を静かに破壊する
  if (current !== expected) {
    throw new RequestError(
      409,
      "本文が変更されています。再読み込みしてください",
    );
  }

  const next = body.trim();
  if (next === "") throw new RequestError(400, "本文を空にはできません");
  if (next === current) return { source: null, previous: current, next };

  return {
    source: `${source.slice(0, bodyStart)}${next}\n`,
    previous: current,
    next,
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
  async function devBodyEditor(request, response) {
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
      if (typeof payload.body !== "string") {
        throw new RequestError(400, "body は文字列で指定してください");
      }
      if (typeof payload.expected !== "string") {
        throw new RequestError(400, "expected は文字列で指定してください");
      }

      const filePath = await resolvePostPath(server.config.root, payload.id);
      if (!filePath) throw new RequestError(404, "対象の記事が見つかりません");

      const source = await fs.readFile(filePath, "utf8");
      const result = buildNextSource(source, payload);

      if (result.source === null) {
        sendJson(response, 200, { changed: false });
        return;
      }

      await fs.writeFile(filePath, result.source, "utf8");
      // 未参照画像の削除はここでは行わない（scripts/prune-images.mjs を参照）
      sendJson(response, 200, { changed: true });
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }
      server.config.logger.error(
        `[body-editor] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      sendJson(response, 500, { message: "本文の更新に失敗しました" });
    }
  };

export default function bodyEditor() {
  return {
    name: "body-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, createHandler(server));
    },
  };
}
