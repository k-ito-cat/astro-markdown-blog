import fs from "node:fs/promises";
import path from "node:path";

const TAGS_PATH = "src/constants/tags.ts";
const CLOSING_PATTERN = /\n\] as const;/;
const MAX_TAG_LENGTH = 40;
// TS の文字列リテラルを壊しうる引用符
const QUOTE_PATTERN = /["'`\\]/;

/** 制御文字を含むか。正規表現に制御文字を書かずに判定する */
const hasControlCharacter = (value) =>
  [...value].some((character) => {
    const code = character.codePointAt(0);
    return code < 0x20 || code === 0x7f;
  });

const LIST_PATTERN = /export const TAGS = \[([\s\S]*?)\n\] as const;/;
const ENTRY_PATTERN = /"((?:[^"\\]|\\.)*)"/g;

/**
 * 一覧はファイルから直に読む。
 * `ssrLoadModule` はモジュールキャッシュを返すため、追記した直後の値を落とす。
 */
export const readTags = async (root) => {
  const source = await fs.readFile(path.resolve(root, TAGS_PATH), "utf8");
  const match = LIST_PATTERN.exec(source);
  if (!match) throw new TagError(500, `${TAGS_PATH} の形式を解釈できません`);

  return [...match[1].matchAll(ENTRY_PATTERN)].map(([, tag]) =>
    JSON.parse(`"${tag}"`),
  );
};

export class TagError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const normalize = (value) => value.trim();

/**
 * 追加するタグを検証する。
 * 表示側は localeCompare で並べ替えるため、ファイル上の位置は問わない。
 */
export const validateNewTags = (values, existing) => {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new TagError(400, "追加するタグの形式が不正です");
  }

  const known = new Set(existing.map((tag) => tag.toLowerCase()));
  const added = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new TagError(400, "追加するタグの形式が不正です");
    }

    const tag = normalize(value);
    if (tag === "") throw new TagError(400, "空のタグは追加できません");
    if (tag.length > MAX_TAG_LENGTH) {
      throw new TagError(400, `タグが長すぎます: ${tag.slice(0, 20)}…`);
    }
    if (QUOTE_PATTERN.test(tag) || hasControlCharacter(tag)) {
      throw new TagError(400, `タグに使えない文字が含まれています: ${tag}`);
    }
    if (known.has(tag.toLowerCase())) continue;

    known.add(tag.toLowerCase());
    added.push(tag);
  }
  return added;
};

/**
 * 定数から 1 件消す。使用中かどうかの判断は呼び出し側の責任。
 * @returns 消したかどうか
 */
export const removeTag = async (root, tag) => {
  const filePath = path.resolve(root, TAGS_PATH);
  const source = await fs.readFile(filePath, "utf8");
  const entry = `  ${JSON.stringify(tag)},\n`;
  if (!source.includes(entry)) return false;

  await fs.writeFile(filePath, source.replace(entry, ""), "utf8");
  return true;
};

/**
 * 定数の末尾へ追記する。既存のグループ分けコメントには触れない。
 * @returns 実際に追記したタグ
 */
export const appendTags = async (root, tags) => {
  if (tags.length === 0) return [];

  const filePath = path.resolve(root, TAGS_PATH);
  const source = await fs.readFile(filePath, "utf8");
  const match = CLOSING_PATTERN.exec(source);
  if (!match) {
    throw new TagError(500, `${TAGS_PATH} の形式を解釈できません`);
  }

  // 呼び出し側が持つ一覧は dev サーバーのモジュールキャッシュ由来で、
  // 追記直後は古いことがある。二重に積まないよう、現物と突き合わせる
  const missing = tags.filter(
    (tag) => !source.includes(`${JSON.stringify(tag)},`),
  );
  if (missing.length === 0) return [];

  const lines = missing.map((tag) => `  ${JSON.stringify(tag)},`).join("\n");
  // match.index は閉じ括弧の直前の改行を指す。行を挟んでから改行を戻す
  const next =
    `${source.slice(0, match.index)}\n${lines}\n` +
    source.slice(match.index + 1);
  await fs.writeFile(filePath, next, "utf8");
  return missing;
};
