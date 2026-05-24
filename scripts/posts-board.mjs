import fs from "node:fs/promises";
import path from "node:path";

const POSTS_DIR = path.join(process.cwd(), "src/content/posts/blog");
const VALID_STATUSES = ["published", "private", "draft"];
const STATUS_LABELS = [...VALID_STATUSES, "missing", "unknown"];
const VALID_WRITING_STATUSES = [
  "writing",
  "planned-high",
  "planned-mid",
  "todo",
  "done",
];
const WRITING_STATUS_LABELS = [...VALID_WRITING_STATUSES, "missing", "unknown"];
const MEMO_HEADING_PATTERN = /^## メモ\s*$/gm;
const args = new Set(process.argv.slice(2));
const showDetail = args.has("--detail") || args.has("-d");

const colors = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const color = (value, colorName) =>
  process.stdout.isTTY ? `${colors[colorName]}${value}${colors.reset}` : value;

const pad = (value, length) => String(value).padEnd(length, " ");
const count = (entries, predicate) => entries.filter(predicate).length;
const isWideCodePoint = (codePoint) =>
  (codePoint >= 0x1100 && codePoint <= 0x115f) ||
  (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
  (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
  (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
  (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
  (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
  (codePoint >= 0xff00 && codePoint <= 0xff60) ||
  (codePoint >= 0xffe0 && codePoint <= 0xffe6);
const visibleLength = (value) =>
  Array.from(String(value).replace(/\x1b\[[0-9;]*m/g, "")).reduce(
    (length, character) =>
      length + (isWideCodePoint(character.codePointAt(0)) ? 2 : 1),
    0,
  );
const cell = (value, width) => {
  const text = String(value);
  return `${text}${" ".repeat(Math.max(0, width - visibleLength(text)))}`;
};

const createTable = (headers, rows) => {
  const widths = headers.map((header, index) =>
    Math.max(
      visibleLength(header),
      ...rows.map((row) => visibleLength(row[index] ?? "")),
    ),
  );
  const border = (left, separator, right) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(separator)}${right}`;
  const row = (values) =>
    `│ ${values.map((value, index) => cell(value, widths[index])).join(" │ ")} │`;

  return [
    border("┌", "┬", "┐"),
    row(headers),
    border("├", "┼", "┤"),
    ...rows.map(row),
    border("└", "┴", "┘"),
  ].join("\n");
};

const walkMarkdownFiles = async (dir) => {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const fullPath = path.join(dir, dirent.name);

      if (dirent.isDirectory()) return walkMarkdownFiles(fullPath);
      if (dirent.isFile() && dirent.name.endsWith(".md")) return [fullPath];
      return [];
    }),
  );

  return files.flat();
};

const parseFrontmatter = (content) => {
  if (!content.startsWith("---\n")) return {};

  const endIndex = content.indexOf("\n---", 4);
  if (endIndex === -1) return {};

  const frontmatter = content.slice(4, endIndex);
  const result = {};

  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    result[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }

  return result;
};

const detectMemoState = (content) => {
  const matches = [...content.matchAll(MEMO_HEADING_PATTERN)];

  if (matches.length === 0) return "NO_MEMO";
  if (matches.length > 1) {
    return "BROKEN_MEMO";
  }

  const memoStartIndex = matches[0].index + matches[0][0].length;
  const memo = content.slice(memoStartIndex);
  return memo.trim().length > 0 ? "HAS_MEMO" : "EMPTY_MEMO";
};

const readPost = async (filePath) => {
  const content = await fs.readFile(filePath, "utf8");
  const frontmatter = parseFrontmatter(content);
  const status = frontmatter.status;
  const writingStatus = frontmatter.writingStatus;
  const statusGroup = !status
    ? "missing"
    : VALID_STATUSES.includes(status)
      ? status
      : "unknown";
  const writingStatusGroup = !writingStatus
    ? "missing"
    : VALID_WRITING_STATUSES.includes(writingStatus)
      ? writingStatus
      : "unknown";

  return {
    file: path.relative(POSTS_DIR, filePath),
    title: frontmatter.title || "(no title)",
    status: status || "(missing)",
    statusGroup,
    writingStatus: writingStatus || "(missing)",
    writingStatusGroup,
    memoState: detectMemoState(content),
  };
};

const memoSummary = (entries) => ({
  has: count(entries, (entry) => entry.memoState === "HAS_MEMO"),
  empty: count(entries, (entry) => entry.memoState === "EMPTY_MEMO"),
  none: count(entries, (entry) => entry.memoState === "NO_MEMO"),
  broken: count(entries, (entry) => entry.memoState === "BROKEN_MEMO"),
});

const statusColor = (status) => {
  if (status === "private") return "yellow";
  if (status === "draft") return "cyan";
  if (status === "published") return "green";
  return "red";
};

const writingStatusColor = (writingStatus) => {
  if (writingStatus === "writing") return "cyan";
  if (writingStatus === "planned-high") return "yellow";
  if (writingStatus === "planned-mid") return "yellow";
  if (writingStatus === "done") return "green";
  if (writingStatus === "todo") return "dim";
  return "red";
};

const memoColor = (memoState) => {
  if (memoState === "HAS_MEMO") return "cyan";
  if (memoState === "EMPTY_MEMO") return "yellow";
  if (memoState === "BROKEN_MEMO") return "red";
  return "dim";
};

const createSummaryRows = (entries, labels, field, colorByLabel) =>
  labels.map((label) => {
    const labelEntries = entries.filter((entry) => entry[field] === label);
    const summary = memoSummary(labelEntries);
    return [
      color(label, colorByLabel(label)),
      String(labelEntries.length),
      String(summary.has),
      String(summary.empty),
      String(summary.none),
      String(summary.broken),
    ];
  });

const printSummaryTable = (title, firstHeader, rows) => {
  console.log(color(title, "bold"));
  console.log(
    createTable(
      [firstHeader, "total", "memo", "empty", "none", "broken"],
      rows,
    ),
  );
};

const printSummary = (entries) => {
  console.log(color("Blog Post Board", "bold"));
  console.log("");
  printSummaryTable(
    "Publish Status",
    "status",
    createSummaryRows(entries, STATUS_LABELS, "statusGroup", statusColor),
  );
  console.log("");
  printSummaryTable(
    "Writing Status",
    "writingStatus",
    createSummaryRows(
      entries,
      WRITING_STATUS_LABELS,
      "writingStatusGroup",
      writingStatusColor,
    ),
  );

  const missingStatus = count(
    entries,
    (entry) => entry.statusGroup === "missing",
  );
  const unknownStatus = count(
    entries,
    (entry) => entry.statusGroup === "unknown",
  );
  const missingWritingStatus = count(
    entries,
    (entry) => entry.writingStatusGroup === "missing",
  );
  const unknownWritingStatus = count(
    entries,
    (entry) => entry.writingStatusGroup === "unknown",
  );
  const brokenMemo = count(
    entries,
    (entry) => entry.memoState === "BROKEN_MEMO",
  );

  console.log("");
  console.log(color("Issues", "bold"));
  console.log(`  missing status: ${missingStatus}`);
  console.log(`  unknown status: ${unknownStatus}`);
  console.log(`  missing writingStatus: ${missingWritingStatus}`);
  console.log(`  unknown writingStatus: ${unknownWritingStatus}`);
  console.log(`  broken memo:    ${brokenMemo}`);
};

const printDetail = (entries) => {
  console.log("");

  for (const writingStatus of WRITING_STATUS_LABELS) {
    const statusEntries = entries.filter(
      (entry) => entry.writingStatusGroup === writingStatus,
    );
    if (statusEntries.length === 0) continue;

    console.log(
      color(writingStatus.toUpperCase(), writingStatusColor(writingStatus)),
    );

    console.log(
      createTable(
        ["status", "memo", "title", "file"],
        statusEntries.map((entry) => [
          color(entry.status, statusColor(entry.statusGroup)),
          color(entry.memoState, memoColor(entry.memoState)),
          entry.title,
          color(entry.file, "dim"),
        ]),
      ),
    );

    console.log("");
  }
};

const main = async () => {
  const files = await walkMarkdownFiles(POSTS_DIR);
  const entries = (await Promise.all(files.map(readPost))).sort((a, b) =>
    a.file.localeCompare(b.file, "ja"),
  );

  printSummary(entries);
  if (showDetail) printDetail(entries);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
