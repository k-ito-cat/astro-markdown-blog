import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";

const ENDPOINT = "/__frontmatter";
const POSTS_DIR = "src/content/posts";
const POST_EXTENSIONS = [".md", ".mdx"];
const MAX_BODY_BYTES = 64 * 1024;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FRONTMATTER_PATTERN = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const loadFieldSpecs = async (server) => {
  const [categories, tags, priority, published, writing, verification] =
    await Promise.all([
      server.ssrLoadModule("/src/constants/categories.ts"),
      server.ssrLoadModule("/src/constants/tags.ts"),
      server.ssrLoadModule("/src/constants/postPriority.ts"),
      server.ssrLoadModule("/src/constants/publishedStatus.ts"),
      server.ssrLoadModule("/src/constants/writingStatus.ts"),
      server.ssrLoadModule("/src/constants/verificationStatus.ts"),
    ]);

  return {
    title: { kind: "text", required: true },
    publishedAt: { kind: "date", required: true },
    updatedAt: { kind: "date", required: true },
    thumbnail: { kind: "text", required: false },
    githubUrl: { kind: "text", required: false },
    categories: {
      kind: "list",
      options: categories.CATEGORIES,
      min: 1,
      max: categories.MAX_CATEGORIES_PER_POST,
    },
    tags: { kind: "list", options: tags.TAGS, min: 1 },
    status: {
      kind: "choice",
      required: true,
      options: Object.values(published.PUBLISHED_STATUS),
    },
    writingStatus: {
      kind: "choice",
      required: true,
      options: Object.values(writing.WRITING_STATUS),
    },
    priority: {
      kind: "choice",
      required: true,
      options: Object.values(priority.POST_PRIORITY),
    },
    verificationStatus: {
      kind: "choice",
      required: false,
      options: Object.values(verification.VERIFICATION_STATUS),
    },
  };
};

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

const normalizeField = (field, spec, raw) => {
  if (spec.kind === "list") {
    if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
      throw new RequestError(400, `${field} は文字列の配列で指定してください`);
    }

    const unknown = raw.filter((item) => !spec.options.includes(item));
    if (unknown.length > 0) {
      throw new RequestError(
        400,
        `${field} に未定義の値があります: ${unknown.join(", ")}`,
      );
    }
    if (new Set(raw).size !== raw.length) {
      throw new RequestError(400, `${field} の値が重複しています`);
    }
    if (raw.length < spec.min) {
      throw new RequestError(400, `${field} は${spec.min}件以上選んでください`);
    }
    if (spec.max !== undefined && raw.length > spec.max) {
      throw new RequestError(400, `${field} は${spec.max}件までです`);
    }
    return raw;
  }

  if (typeof raw !== "string") {
    throw new RequestError(400, `${field} は文字列で指定してください`);
  }

  const value = raw.trim();
  if (value === "") {
    if (spec.required) throw new RequestError(400, `${field} は必須です`);
    return null;
  }
  if (spec.kind === "date" && !DATE_PATTERN.test(value)) {
    throw new RequestError(
      400,
      `${field} は YYYY-MM-DD 形式で指定してください`,
    );
  }
  if (spec.kind === "choice" && !spec.options.includes(value)) {
    throw new RequestError(400, `${field} に未定義の値があります: ${value}`);
  }
  return value;
};

const isSameValue = (current, next) => {
  if (Array.isArray(next)) {
    return (
      Array.isArray(current) &&
      current.length === next.length &&
      current.every((item, index) => item === next[index])
    );
  }
  return current === next;
};

const updateFrontmatter = ({ parseDocument, source, specs, values }) => {
  const unknownFields = Object.keys(values).filter(
    (field) => !(field in specs),
  );
  if (unknownFields.length > 0) {
    throw new RequestError(
      400,
      `編集できない項目です: ${unknownFields.join(", ")}`,
    );
  }

  const match = FRONTMATTER_PATTERN.exec(source);
  if (!match) throw new RequestError(422, "フロントマターが見つかりません");

  const doc = parseDocument(match[2]);
  if (doc.errors.length > 0) {
    throw new RequestError(
      422,
      `フロントマターを解析できません: ${doc.errors[0].message}`,
    );
  }

  const current = doc.toJS() ?? {};
  const changed = [];

  for (const [field, spec] of Object.entries(specs)) {
    if (!(field in values)) continue;

    const value = normalizeField(field, spec, values[field]);
    if (value === null) {
      if (!doc.has(field)) continue;
      if (spec.kind === "choice") {
        doc.delete(field);
      } else {
        if (isSameValue(current[field], "")) continue;
        doc.set(field, "");
      }
      changed.push(field);
      continue;
    }
    if (doc.has(field) && isSameValue(current[field], value)) continue;

    doc.set(field, value);
    changed.push(field);
  }

  if (changed.length === 0) return { changed, source };

  const nextFrontmatter = doc.toString().replace(/\r?\n$/, "");
  const body = source.slice(match[0].length);
  return {
    changed,
    source: `${match[1]}${nextFrontmatter}${match[3]}${body}`,
  };
};

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const createHandler = (server, parseDocument) =>
  async function devFrontmatterEditor(request, response) {
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
      if (
        payload.data === null ||
        typeof payload.data !== "object" ||
        Array.isArray(payload.data)
      ) {
        throw new RequestError(400, "data はオブジェクトで指定してください");
      }

      const filePath = await resolvePostPath(server.config.root, payload.id);
      if (!filePath) throw new RequestError(404, "対象の記事が見つかりません");

      const specs = await loadFieldSpecs(server);
      const source = await fs.readFile(filePath, "utf8");
      const result = updateFrontmatter({
        parseDocument,
        source,
        specs,
        values: payload.data,
      });

      if (result.changed.length > 0) {
        await fs.writeFile(filePath, result.source, "utf8");
      }
      sendJson(response, 200, { changed: result.changed });
    } catch (error) {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { message: error.message });
        return;
      }
      server.config.logger.error(
        `[frontmatter-editor] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      sendJson(response, 500, {
        message: "フロントマターの更新に失敗しました",
      });
    }
  };

export default function frontmatterEditor() {
  return {
    name: "frontmatter-editor",
    apply: "serve",
    async configureServer(server) {
      const { parseDocument } = await import("yaml");
      server.middlewares.use(ENDPOINT, createHandler(server, parseDocument));
    },
  };
}
