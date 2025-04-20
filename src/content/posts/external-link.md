---
title: "外部リンクを新規タブで開くときの属性"
publishedAt: "2025-04-20"
thumbnail: { src: "/images/thumbnail/external-link.png", alt: "" }
githubUrl: ""
categories: ["HTML", "a11ty"]
---

## 結論

- 外部リンクを示すaタグには、rel属性の`noreferrer`は必要に応じて適宜付与すること
- `noopener`は現在は主要なブラウザで自動的につけてくれるため明示的に付与する必要はない

以下で少しだけ深堀りする

## 外部リンク

自サイトからみて、別のオリジンのサイトへの参照のことを外部リンクと呼ぶと認識しているが、定義としては少し曖昧？

そもそもどこで正確な定義がされているかがわからないのでMDNを置いておく。

<a href="https://developer.mozilla.org/ja/docs/Learn_web_development/Howto/Web_mechanics/What_are_hyperlinks#%E5%A4%96%E9%83%A8%E3%83%AA%E3%83%B3%E3%82%AF" target="_blank" rel="noreferrer">
  外部リンク - MDN
</a>

HTML的にみればこう

```html
<a href="https://google.com" target="_blank" rel="noopener noreferrer" />
```

### target 属性

<a href="https://developer.mozilla.org/ja/docs/Web/HTML/Reference/Elements/a#target" target="_blank" rel="noreferrer">
  target 属性 - MDN
</a>

targetという属性（hrefがもつURLの読み込む先についての意味を持たせる属性）には様々な値を入れることができるが、外部リンクを示す場合は
`target="_blank"`を指定することが一般的。
この値は、新しいタブでリンクを開く という意味を持つ。

### rel 属性

**noreferrer**

targetのURLに遷移した後、その遷移先のサイトでリファラ（どこからアクセスしてきたかという情報）を取得させないようにする

自サイトのURLに重要な情報（セッションIDなど）が入っている場合やGAなどのアナリティクスにどこから来たかという情報を収集させたくない場合（ＧＡでは確か、そのページに来たユーザーのリファラも取れていたような気がする）に有効となる属性。

**noopener**

<a href="https://developer.mozilla.org/ja/docs/Web/HTML/Reference/Attributes/rel/noopener" target="_blank" rel="noreferrer">
rel=noopener - MDN
</a>

新規タブで開いたサイトからwindow.openerにアクセスできないようにブラウザに対する指示。

<a href="https://developer.mozilla.org/ja/docs/Web/API/Window/opener" target="_blank" rel="noreferrer">
  Window: opener プロパティ - MDN
</a>

> Window インターフェイスの opener プロパティは、 open() によって、または target 属性の付いたリンクの操作によって開かれたウィンドウを開いたウィンドウへの参照を返します。

新しく開かれたページで`window.opener.location = "http..."`が実行されると、遷移元のページのURLを書き換えることができるらしい。遷移元ページに戻ったらフィッシングサイトのページに置き換わっているなんてことが発生しかねない。

<a href="https://developer.mozilla.org/ja/docs/Web/API/Window/opener#:~:text=%E3%82%AA%E3%83%BC%E3%83%97%E3%83%8A%E3%83%BC%E3%81%8C%E7%8F%BE%E5%9C%A8%E3%81%AE%E3%83%9A%E3%83%BC%E3%82%B8%E3%81%A8%E5%90%8C%E3%81%98%E3%82%AA%E3%83%AA%E3%82%B8%E3%83%B3%E4%B8%8A%E3%81%AB%E3%81%AA%E3%81%84%E5%A0%B4%E5%90%88%E3%80%81%E3%82%AA%E3%83%BC%E3%83%97%E3%83%8A%E3%83%BC%E3%82%AA%E3%83%96%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88%E3%81%AE%E6%A9%9F%E8%83%BD%E3%81%AF%E5%88%B6%E9%99%90%E3%81%95%E3%82%8C%E3%81%BE%E3%81%99%E3%80%82%E4%BE%8B%E3%81%88%E3%81%B0%E3%80%81%E3%82%A6%E3%82%A3%E3%83%B3%E3%83%89%E3%82%A6%E3%82%AA%E3%83%96%E3%82%B8%E3%82%A7%E3%82%AF%E3%83%88%E3%81%AE%E5%A4%89%E6%95%B0%E3%81%A8%E9%96%A2%E6%95%B0%E3%81%AF%E3%82%A2%E3%82%AF%E3%82%BB%E3%82%B9%E3%81%99%E3%82%8B%E3%81%93%E3%81%A8%E3%81%8C%E3%81%A7%E3%81%8D%E3%81%BE%E3%81%9B%E3%82%93%E3%80%82" target="_blank" rel="noreferrer">
  基本的なwindowオブジェクトへのアクセスは制限される
</a>
ものの、window.openerのナビゲーションのアクセスは制限されないという。

なので`noopener`をつける必要がある。

要するに、自サイトから信用のないサイトへの外部リンクを貼る際は、その外部サイトが遷移元のサイトをフィッシングサイトなどに置き換える可能性を防ぐために、`noopener`をrel属性につけるべきだが、現在はブラウザがaタグに`target="_blank"`が記述されているとき、自動的に`noopener`をつけてくれる仕様となっているので、`noopener`に関してはつけなくてもよくなった。（WordPressも同様の仕様だったはず）
