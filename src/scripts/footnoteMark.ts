/**
 * 脚注の飛び先にマーカーを置き、次のclickで外す。
 *
 * `:target` と `:has()` だけでも書けるが、効いているかを目で確かめにくい。
 * 飛び先とその行へクラスを付ける形にして、DOM を見れば分かるようにする。
 *
 * 消す合図はclickだけにする。scroll や pointermove では、送っている最中の
 * scroll を拾ってしまい、見える前に消える。
 *
 * ただし脚注のlink自身のclickは数えない。ClientRouter は preventDefault して
 * から非同期に遷移するため、click と hashchange の到着順に頼ると、付けた直後に
 * 自分で消す形になりうる。押した先が脚注なら、消さずに付け直しへ任せる。
 *
 * URL は書き換えない。hash を消すと履歴に触れ、戻る操作の行き先が変わる。
 */
const MARK = "is-footnote-marked";
const MARK_BLOCK = "is-footnote-marked-block";

/** 行として塗れる最小の単位。CSS で「行」は選べない */
const BLOCK = "p, li, td, th";

export const initFootnoteMark = (signal: AbortSignal) => {
  // 記法ペインの表示例も .prose を名乗るため、記事の本文に限って拾う
  const prose = document.querySelector<HTMLElement>(".article .prose");
  if (!prose) return;

  const clear = () => {
    prose
      .querySelectorAll(`.${MARK}, .${MARK_BLOCK}`)
      .forEach((node) => node.classList.remove(MARK, MARK_BLOCK));
  };

  const mark = () => {
    clear();

    const id = location.hash.slice(1);
    if (!id) return;

    // 脚注の参照と一覧の項目だけを対象にする。見出しのアンカーは塗らない
    const target = prose.querySelector(
      `[data-footnote-ref][id="${CSS.escape(id)}"], .footnotes li[id="${CSS.escape(id)}"]`,
    );
    if (!target) return;

    target.classList.add(MARK);
    target.closest(BLOCK)?.classList.add(MARK_BLOCK);
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("[data-footnote-ref], [data-footnote-backref]")) return;
    clear();
  };

  window.addEventListener("click", onClick, { signal, passive: true });
  window.addEventListener("hashchange", mark, { signal });
  // 同一ページの hash 移動で ClientRouter が投げる。hashchange が来ない経路の保険
  window.addEventListener("popstate", mark, { signal });

  mark();
};
