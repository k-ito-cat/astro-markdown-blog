import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { readTags, removeTag, TagError } from "./tagStore.mjs";

const ENDPOINT = "/__tag";
const POSTS_DIR = "src/content/posts";
const POST_EXTENSIONS = [".md", ".mdx"];
const MAX_REQUEST_BYTES = 8 * 1024;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/;

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new TagError(413, "リクエストが大きすぎます"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

/**
 * そのタグを使っている記事を探す。
 * 使われたまま定数から消すと、記事側のスキーマ検証が落ちて dev サーバーが止まる。
 */
const findUsage = async (root, parseDocument, tag) => {
  const postsDir = path.resolve(root, POSTS_DIR);
  const entries = await fs.readdir(postsDir, { recursive: true });
  const files = entries.filter((entry) =>
    POST_EXTENSIONS.includes(path.extname(entry)),
  );

  const used = [];
  for (const entry of files) {
    const source = await fs.readFile(path.join(postsDir, entry), "utf8");
    const match = FRONTMATTER_PATTERN.exec(source);
    if (!match) continue;

    // 表記は記事ごとに違う（flow と block の両方がある）。YAML として読む
    const tags = parseDocument(match[1]).toJS()?.tags;
    if (Array.isArray(tags) && tags.includes(tag)) used.push(entry);
  }
  return used;
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const createHandler = (server, parseDocument) =>
  async function devTagEditor(request, response) {
    try {
      if (request.method !== "POST") {
        throw new TagError(405, "POST のみ受け付けます");
      }

      let payload;
      try {
        payload = JSON.parse(await readRequestBody(request));
      } catch (error) {
        if (error instanceof TagError) throw error;
        throw new TagError(400, "リクエストの JSON を解析できません");
      }
      if (payload?.action !== "delete") {
        throw new TagError(400, `未対応の操作です: ${String(payload?.action)}`);
      }

      const { tag } = payload;
      const { root } = server.config;
      if (typeof tag !== "string" || tag === "") {
        throw new TagError(400, "タグを指定してください");
      }
      if (!(await readTags(root)).includes(tag)) {
        throw new TagError(404, `定数にありません: ${tag}`);
      }

      const used = await findUsage(root, parseDocument, tag);
      if (used.length > 0) {
        sendJson(response, 409, {
          message: `${used.length} 件の記事が使っているため削除できません`,
          used,
        });
        return;
      }

      await removeTag(root, tag);
      sendJson(response, 200, { tag });
    } catch (error) {
      if (error instanceof TagError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }
      server.config.logger.error(
        `[tag-editor] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      sendJson(response, 500, { message: "タグの削除に失敗しました" });
    }
  };

export default function tagEditor() {
  return {
    name: "tag-editor",
    apply: "serve",
    async configureServer(server) {
      const { parseDocument } = await import("yaml");
      server.middlewares.use(ENDPOINT, createHandler(server, parseDocument));
    },
  };
}
