import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "/__image";
// 正本は submodule 側。public/ は copy-images の生成物だが、dev で即座に配信するため同時に書く
const SOURCE_DIR = "src/content/posts/images";
const PUBLIC_DIR = "public/images";
const PUBLIC_PATH = "/images";
const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

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
        // base64 で約 4/3 に膨らむため、実際の画像は 9MB 程度が上限になる
        reject(new RequestError(413, "画像が大きすぎます（9MB 程度まで）"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });

const pad = (value) => String(value).padStart(2, "0");

/** 既存の画像に合わせて YYYYMMDD-HHMMSS.<ext> で採番する */
const buildFileName = (extension) => {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  return `${stamp}.${extension}`;
};

const resolveAvailableName = async (sourceDir, extension) => {
  const base = buildFileName(extension);
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const name = suffix === 0 ? base : base.replace(".", `-${suffix}.`);
    const exists = await fs
      .stat(path.join(sourceDir, name))
      .then(() => true)
      .catch(() => false);
    if (!exists) return name;
  }
  throw new RequestError(409, "ファイル名を決められませんでした");
};

const createHandler = (server) =>
  async function devImageUploader(request, response) {
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

      const extension = EXTENSIONS[payload?.type];
      if (!extension) {
        throw new RequestError(
          415,
          `対応していない画像形式です: ${String(payload?.type)}`,
        );
      }
      if (typeof payload.data !== "string" || payload.data === "") {
        throw new RequestError(400, "data は base64 文字列で指定してください");
      }

      const content = Buffer.from(payload.data, "base64");
      if (content.length === 0) {
        throw new RequestError(400, "画像を読み取れませんでした");
      }

      const sourceDir = path.resolve(server.config.root, SOURCE_DIR);
      const publicDir = path.resolve(server.config.root, PUBLIC_DIR);
      const name = await resolveAvailableName(sourceDir, extension);

      await fs.mkdir(publicDir, { recursive: true });
      await fs.writeFile(path.join(sourceDir, name), content);
      await fs.writeFile(path.join(publicDir, name), content);

      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(JSON.stringify({ path: `${PUBLIC_PATH}/${name}` }));
    } catch (error) {
      const status = error instanceof RequestError ? error.status : 500;
      if (status === 500) {
        server.config.logger.error(
          `[image-uploader] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
        );
      }
      response.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          message:
            status === 500 ? "画像の保存に失敗しました" : (error.message ?? ""),
        }),
      );
    }
  };

export default function imageUploader() {
  return {
    name: "image-uploader",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, createHandler(server));
    },
  };
}
