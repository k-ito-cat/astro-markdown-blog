/*
 * タグの並び順。上部の一覧と簡易検索は別々に持つ。
 * 簡易検索は絞り込み中に開く一時的な面なので、一覧の読み方まで引きずらせない
 */

type Listener = (alpha: boolean) => void;

const createSortMode = (key: string) => {
  const listeners = new Set<Listener>();

  const read = () => {
    try {
      return localStorage.getItem(key) === "alpha";
    } catch {
      return false;
    }
  };

  let alpha = read();

  return {
    isAlpha: () => alpha,

    setAlpha: (next: boolean) => {
      if (alpha === next) return;

      alpha = next;
      try {
        localStorage.setItem(key, alpha ? "alpha" : "count");
      } catch {
        /* 保存できない設定でも、そのページの並びは切り替えられる */
      }
      listeners.forEach((listener) => listener(alpha));
    },

    /** 変更の購読。返り値を呼ぶと購読を外す */
    onChange: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/** 探すページ上部のタグ一覧の並び */
export const tagListSort = createSortMode("tagSort");

/** 簡易検索の中のタグの並び */
export const filterTagSort = createSortMode("filterTagSort");
