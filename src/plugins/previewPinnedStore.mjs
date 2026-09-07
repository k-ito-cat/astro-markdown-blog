import fs from "node:fs/promises";
import path from "node:path";

const PINNED_PATH = "src/constants/previewPinned.ts";
const LIST_PATTERN =
  /export const PREVIEW_PINNED_SLUGS: readonly string\[\] = \[([\s\S]*?)\];/;
const ENTRY_PATTERN = /"((?:[^"\\]|\\.)*)"/g;
// slug はファイル名なので、この字種だけを許す
const SLUG_PATTERN = /^[\w-]+$/;

export class PinError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * 一覧はファイルから直に読む。
 * `ssrLoadModule` はモジュールキャッシュを返すため、書いた直後の値を落とす。
 */
export const readPinned = async (root) => {
  const source = await fs.readFile(path.resolve(root, PINNED_PATH), "utf8");
  const match = LIST_PATTERN.exec(source);
  if (!match) throw new PinError(500, `${PINNED_PATH} の形式を解釈できません`);

  return [...match[1].matchAll(ENTRY_PATTERN)].map(([, slug]) =>
    JSON.parse(`"${slug}"`),
  );
};

export const validateSlug = (slug) => {
  if (typeof slug !== "string" || slug === "") {
    throw new PinError(400, "slug を指定してください");
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new PinError(400, `slug に使えない文字が含まれています: ${slug}`);
  }
  return slug;
};

/**
 * 配列を書き直す。並びは追加順のままにし、コメントには触れない。
 * @returns 書き込み後の一覧
 */
const write = async (root, slugs) => {
  const filePath = path.resolve(root, PINNED_PATH);
  const source = await fs.readFile(filePath, "utf8");
  const match = LIST_PATTERN.exec(source);
  if (!match) throw new PinError(500, `${PINNED_PATH} の形式を解釈できません`);

  const body =
    slugs.length === 0
      ? "[]"
      : `[\n${slugs.map((slug) => `  ${JSON.stringify(slug)},`).join("\n")}\n]`;
  const next =
    source.slice(0, match.index) +
    `export const PREVIEW_PINNED_SLUGS: readonly string[] = ${body};` +
    source.slice(match.index + match[0].length);

  await fs.writeFile(filePath, next, "utf8");
  return slugs;
};

export const addPinned = async (root, slug) => {
  const current = await readPinned(root);
  if (current.includes(slug)) return current;

  return write(root, [...current, slug]);
};

export const removePinned = async (root, slug) => {
  const current = await readPinned(root);
  if (!current.includes(slug)) return current;

  return write(
    root,
    current.filter((entry) => entry !== slug),
  );
};
