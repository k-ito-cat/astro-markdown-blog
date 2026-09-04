const ENDPOINT = "/__suggest";

export const SUGGESTION_KEYS = [
  "titles",
  "slugs",
  "categories",
  "tags",
  "newTags",
] as const;

export type SuggestionKey = (typeof SUGGESTION_KEYS)[number];

export type Suggestions = Record<SuggestionKey, string[]>;

const getMessage = (payload: unknown, fallback: string) => {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }
  return fallback;
};

const toCandidates = (payload: unknown, key: SuggestionKey) => {
  if (typeof payload !== "object" || payload === null || !(key in payload)) {
    return [];
  }

  const values = (payload as Record<string, unknown>)[key];
  return Array.isArray(values) ? values.map(String) : [];
};

/**
 * 作成ダイアログとフロントマター編集の両方から呼ぶ。
 * id を渡すとその記事の本文も、instruction を渡すと著者の指示も材料になる。
 */
export const fetchSuggestions = async (payload: {
  title: string;
  id?: string;
  instruction?: string;
}): Promise<Suggestions> => {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      getMessage(result, `候補の生成に失敗しました (${response.status})`),
    );
  }

  return {
    titles: toCandidates(result, "titles"),
    slugs: toCandidates(result, "slugs"),
    categories: toCandidates(result, "categories"),
    tags: toCandidates(result, "tags"),
    newTags: toCandidates(result, "newTags"),
  };
};

export const countSuggestions = (suggestions: Suggestions) =>
  SUGGESTION_KEYS.reduce((count, key) => count + suggestions[key].length, 0);

/**
 * 候補は押して初めて入力に入る。押されるまで既存の値は変えない。
 * @param machine slug のように機械側の識別子を出す枠かどうか
 */
export const renderSuggestions = (
  box: HTMLElement,
  candidates: string[],
  apply: (value: string) => void,
  machine = false,
) => {
  box.textContent = "";
  candidates.forEach((candidate) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = machine
      ? "suggestion-chip suggestion-chip-machine"
      : "suggestion-chip";
    button.textContent = candidate;
    button.addEventListener("click", () => apply(candidate));
    box.append(button);
  });
};

/** 候補枠を data-suggestions の値で引けるようにする */
export const collectSuggestionBoxes = (root: ParentNode) =>
  new Map(
    Array.from(root.querySelectorAll<HTMLElement>("[data-suggestions]")).map(
      (box) => [box.dataset.suggestions ?? "", box],
    ),
  );

export const clearSuggestions = (boxes: Map<string, HTMLElement>) => {
  boxes.forEach((box) => {
    box.textContent = "";
  });
};
