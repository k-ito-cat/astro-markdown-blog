export const SEPARATOR = "\n\n";

export type Block = [number, number];

/** 保存前の本文と、その中でのブロック位置。位置は常に body と同期させる */
export type Draft = {
  body: string;
  blocks: Block[];
};

export type InsertMode = "insert-after" | "insert-before";

const shift = (blocks: Block[], from: number, delta: number): Block[] =>
  blocks.map((block, index) =>
    index < from ? block : [block[0] + delta, block[1] + delta],
  );

export const blockText = ({ body, blocks }: Draft, index: number) =>
  body.slice(blocks[index][0], blocks[index][1]);

export const replaceBlock = (
  { body, blocks }: Draft,
  index: number,
  text: string,
): Draft => {
  const [start, end] = blocks[index];
  const next = shift(blocks, index + 1, text.length - (end - start));
  next[index] = [start, start + text.length];

  return {
    body: `${body.slice(0, start)}${text}${body.slice(end)}`,
    blocks: next,
  };
};

/** 追加したブロックの索引もあわせて返す。以降の索引は 1 つずつ後ろへずれる */
export const insertBlock = (
  { body, blocks }: Draft,
  anchorIndex: number,
  mode: InsertMode,
  text: string,
): { draft: Draft; index: number } => {
  const after = mode === "insert-after";
  const at = after ? blocks[anchorIndex][1] : blocks[anchorIndex][0];
  const addition = after ? `${SEPARATOR}${text}` : `${text}${SEPARATOR}`;
  const index = after ? anchorIndex + 1 : anchorIndex;
  const start = after ? at + SEPARATOR.length : at;

  const next = shift(blocks, index, addition.length);
  next.splice(index, 0, [start, start + text.length]);

  return {
    draft: {
      body: `${body.slice(0, at)}${addition}${body.slice(at)}`,
      blocks: next,
    },
    index,
  };
};

export const deleteBlock = ({ body, blocks }: Draft, index: number): Draft => {
  const [start, end] = blocks[index];
  const before = body.slice(0, start);
  const after = body.slice(end);

  // 前後どちらかの空行も畳んで、区切りを保つ
  const trailing = after.startsWith(SEPARATOR);
  const leading = !trailing && before.endsWith(SEPARATOR);
  const removed = end - start + (trailing || leading ? SEPARATOR.length : 0);
  const nextBody = trailing
    ? `${before}${after.slice(SEPARATOR.length)}`
    : leading
      ? `${before.slice(0, -SEPARATOR.length)}${after}`
      : `${before}${after}`;

  const next = shift(blocks, index + 1, -removed);
  next.splice(index, 1);

  return { body: nextBody, blocks: next };
};

/** 隣り合うブロックを入れ替える。全体の長さは変わらない */
export const moveBlock = (
  { body, blocks }: Draft,
  index: number,
  other: number,
): Draft => {
  const [first, second] = index < other ? [index, other] : [other, index];
  const [aStart, aEnd] = blocks[first];
  const [bStart, bEnd] = blocks[second];
  const head = body.slice(aStart, aEnd);
  const middle = body.slice(aEnd, bStart);
  const tail = body.slice(bStart, bEnd);

  const next = blocks.slice();
  next[first] = [aStart, aStart + tail.length];
  const headStart = aStart + tail.length + middle.length;
  next[second] = [headStart, headStart + head.length];

  return {
    body: `${body.slice(0, aStart)}${tail}${middle}${head}${body.slice(bEnd)}`,
    blocks: next,
  };
};

const DETAILS_OPEN = /<details[\s>]/i;
const DETAILS_CLOSE = /<\/details\s*>/i;

/**
 * `<details>` は中身との間に空行があると開始・中身・終了で別ブロックに割れるが、
 * 描画後は 1 要素になる。要素とブロックの数が合わないとインライン編集が止まるため、
 * 開始から終了までを 1 ブロックへまとめる。入れ子の details は扱わない。
 */
export const mergeDetailsBlocks = (blocks: Block[], body: string): Block[] => {
  const merged: Block[] = [];
  let open: Block | null = null;

  for (const block of blocks) {
    const text = body.slice(block[0], block[1]);

    if (open) {
      open = [open[0], block[1]];
      if (DETAILS_CLOSE.test(text)) {
        merged.push(open);
        open = null;
      }
      continue;
    }

    if (DETAILS_OPEN.test(text) && !DETAILS_CLOSE.test(text)) {
      open = block;
      continue;
    }

    merged.push(block);
  }

  // 閉じていない場合は数を変えず、元の並びのまま扱う
  return open ? blocks : merged;
};
