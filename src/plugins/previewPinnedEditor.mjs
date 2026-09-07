import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import {
  addPinned,
  PinError,
  readPinned,
  removePinned,
  validateSlug,
} from "./previewPinnedStore.mjs";

const ENDPOINT = "/__pin";
const POSTS_DIR = "src/content/posts";
const POST_EXTENSIONS = [".md", ".mdx"];
const MAX_REQUEST_BYTES = 4 * 1024;

const readRequestBody = (request) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new PinError(413, "リクエストが大きすぎます"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

/** 実在しない slug を固定すると、一覧に出ない項目が定数へ残る */
const exists = async (root, slug) => {
  const postsDir = path.resolve(root, POSTS_DIR);
  const entries = await fs.readdir(postsDir, { recursive: true });
  return entries.some((entry) =>
    POST_EXTENSIONS.some(
      (extension) => path.basename(entry, extension) === slug,
    ),
  );
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const createHandler = (server) =>
  async function devPreviewPinnedEditor(request, response) {
    try {
      if (request.method !== "POST") {
        throw new PinError(405, "POST のみ受け付けます");
      }

      let payload;
      try {
        payload = JSON.parse(await readRequestBody(request));
      } catch (error) {
        if (error instanceof PinError) throw error;
        throw new PinError(400, "リクエストの JSON を解析できません");
      }

      const { action } = payload ?? {};
      if (action !== "add" && action !== "remove") {
        throw new PinError(400, `未対応の操作です: ${String(action)}`);
      }

      const { root } = server.config;
      const slug = validateSlug(payload.slug);

      if (action === "add") {
        if (!(await exists(root, slug))) {
          throw new PinError(404, `記事が見つかりません: ${slug}`);
        }
        sendJson(response, 200, { slug, pinned: await addPinned(root, slug) });
        return;
      }

      sendJson(response, 200, { slug, pinned: await removePinned(root, slug) });
    } catch (error) {
      if (error instanceof PinError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }
      server.config.logger.error(
        `[preview-pinned-editor] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      sendJson(response, 500, { message: "ピン留めの更新に失敗しました" });
    }
  };

export default function previewPinnedEditor() {
  return {
    name: "preview-pinned-editor",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, createHandler(server));
    },
  };
}

export { readPinned };
