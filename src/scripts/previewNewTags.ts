const MAX_TAG_LENGTH = 40;

export type NewTagStore = {
  values: () => string[];
  add: (tag: string) => void;
};

/**
 * まだ定数に無いタグを控えておく。
 * 実際に `src/constants/tags.ts` へ書くのは保存・作成のときで、
 * ここでは選び直せる状態のまま持つ。
 */
export const initNewTags = (
  root: ParentNode,
  onChange: (message?: string) => void,
): NewTagStore => {
  const list = root.querySelector<HTMLElement>("[data-new-tags]");
  const input = root.querySelector<HTMLInputElement>("[data-new-tag-input]");
  const addButton = root.querySelector<HTMLButtonElement>("[data-new-tag-add]");
  const pending: string[] = [];

  // 握りつぶすと「押しても何も起きない」だけになり、原因が追えなくなる
  if (!list || !input || !addButton) {
    console.error("[preview] タグ追加 UI の要素が見つかりません", {
      list: Boolean(list),
      input: Boolean(input),
      addButton: Boolean(addButton),
    });
  }

  const render = () => {
    if (!list) return;

    list.textContent = "";
    pending.forEach((tag) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "new-tag-chip";
      chip.textContent = tag;
      chip.title = "取り消す";
      chip.addEventListener("click", () => {
        pending.splice(pending.indexOf(tag), 1);
        render();
        onChange();
      });
      list.append(chip);
    });
  };

  const add = (value: string) => {
    const tag = value.trim();
    if (tag === "") return;
    if (tag.length > MAX_TAG_LENGTH) {
      onChange("タグが長すぎます");
      return;
    }
    // 既存タグと同じものは、そのまま選べるので控えない
    const known = root.querySelector(
      `input[name="tags"][value="${CSS.escape(tag)}"]`,
    );
    if (known instanceof HTMLInputElement) {
      if (!known.checked && !known.disabled) known.checked = true;
      onChange("既にあるタグを選びました");
      render();
      return;
    }
    if (pending.includes(tag)) return;

    pending.push(tag);
    render();
    onChange();
  };

  /** 絞り込みと同じ入力を使うため、消したことを絞り込み側にも伝える */
  const clearInput = () => {
    if (!input) return;

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };

  addButton?.addEventListener("click", () => {
    if (!input) return;

    add(input.value);
    clearInput();
    input.focus();
  });

  // 追加欄の Enter は「追加」。日本語入力の変換確定では動かさない
  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    if (event.isComposing) return;

    add(input.value);
    clearInput();
  });

  return { values: () => [...pending], add };
};
