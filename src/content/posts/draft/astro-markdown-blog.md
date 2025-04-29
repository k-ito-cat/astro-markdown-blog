---
title: "Astro Markdownで技術ブログを作成"
publishedAt: "2024-03-01"
thumbnail: { src: "/images/thumbnail/filename-extension.png", alt: "" }
categories: ["Astro", "Astro Markdown", "hygen"]
githubUrl: "https://github.com/k-ito-cat/astro-markdown-blog"
---

## まずはこんなものを作った

### 経緯

- astro microcmsで技術ブログ作った。ssrで。ただ、執筆しにくすぎた。mdが公式サポートされてないしエディタ使いにくいし好みじゃなかった

mdでかけるいい方法ないかなと思ったらそういえばastroはmdxできるから隠者ねって思った。書いた記事もgit管理できるしいいやん。という経緯（notionだとgit管理できないし）

で、作ったものは

- mdのデータをastroに展開して表示

超シンプル。

で、追加で

- mdでエディタで書くためのテンプレをhygen生成
- 展開後のスタイリングはprose
- github apiでgithubカードを表示させる
- カテゴリ管理がやや面倒。どうにかしたい、buildしないと反映できない（ssg）

### もっとこうしたい

- スマホで書きたい
- 別端末でも書きたい

→ どうやらObsidianというサービスがいいらしい

実際に使ってみたけどカテゴリに補完が聞いた（フロントマターから勝手に推測してくれて複数タグ選択UIにしてくれてる。多分配列だとこうなる。vscodeだと補完が聞かないけどここではきく。ただし、定数のサジェストは出ず今までカテゴリとして他の記事で入力されたタグだけが対象だけどそれでもでかい）
フロントマターでtsが使えないから、型定義利用して補完聞かせるみたいなことができないけどこれができるなら十分かも

window,mac,iphone,androidとあるのでどの端末でも書くことができる

異なる端末で作業ができるっていうのは解決できたが、統合ツールじゃないからターミナルとか使えない。のでプレビューとかみれないしhygenも使えない。ただgitに挙げてないローカルのファイルを各端末で編集できるのはでかいしカテゴリの補完もありがたい。

→ iframeとか画像プレビューできないのつらい。やっぱcms???

デフォではターミナル使えないから
Obsidian Shell commandsをいれてターミナル実行可能にする

スマホで書くために、git clientをiosに導入 working copy
クローンしてpushとかできる
公開リポジトリならhttpクローン出来るが、プライベートならssh登録してsshクローンか、認証キー作ってhttpクローン
pushのたびに認証やるの嫌なのでssh作る

## サブモジュール化

スマホでクローンしたときastroテンプレートが邪魔。どのみちここら辺はスマホで変更させることはないからmdファイルを束ねるディレクトリだけ
クローンしたいのでサブモジュール化する。サブモジュールのメリットはいろいろあるが自分的には以下

- 階層を保ちつつリポジトリだけ切り出せる。開発に影響せず、リポジトリを切り出せるのはデカい
- リポジトリ切り出せると記事だけに集中できる
- 記事ディレクトリだけサブモジュール化すると、記事変更のgitの差分を隠ぺいできる
  詳しく言うと、記事の変更差分はコミットログ（草）としては反映したいけど実際にどのような差分を残してるか見られたくない（要するに下書き状態のものを後悔したくない）
  ので、サブモジュール化した記事ディレクトリだけプライベートにすることで、テンプレートは公開するけど記事の下書きは公開しない（差分を見させない）ってことができる
  すでに公開した記事の差分も見られないけど公開した記事は実際にサイトのほうで見れるから何ら問題なし。この運用結構気に入ってる

画像はどうするか、本体側のpublicにおいてたけど、画像だけそっちで管理するのはなんか嫌なのでこっちにimagesを置いた。ただホスティングしたとき
このimagesはビルドに含まれない？で参照できないのでビルド設定いじる必要があるが、めんどいのでここのimagesをbuild字にpublicにコピーさせるようにした。
これでこっちがわでimages管理するので本体側のimagesはgitignoreにする。

🧱 Hygenでテンプレ作成 本体と分かれることで、テンプレ管理と実行の連携が面倒になる
🧩 Astro + Zodでカテゴリの検証 src/content/posts/\*.md にあるべき構造をZodで静的検証してるなら、サブモジュール側の設計変更が即反映されない
🔁 Amplifyの自動ビルド非対応 サブモジュール更新だけではトリガーされない＝運用が面倒
🔌 VSCodeの連携も分断 ファイル検索、型補完、Lintなどが本体と連動しづらくなる

ので、結局サブモジュールの相性悪かったのでやめた

かわりに、作業ブランチ作ってそこにコミットしてそのコミットを本体リポジトリじゃなくて別のプライベートリポジトリにpushすることにした。
それで履歴はほかのリポジトリに行くし、草も生える
って思ったけど二重管理発生するの嫌だし、別にそもそも作業途中でコミットせず、サクッと書いてアウトプットしまくればいい話なのでこんなんしなくても普通に運用するわ

NetlifyCMS git管理しつつcms使えるらしいけどもうastro mdにしちゃったからいいや。めんどい

## astro markdownとは

## Astro v5については以下参照

<!-- 執筆した記事url -->

## markdownでかける

記事をgit管理できる

以前までtechblogをmicroCMSでつないでたが、シンプルにmicroCMSが使い悪すぎた（md使えない、エディタがバグる、コードブロックとテーブルがあまりに使いにくい（コピペが許されない））

画像の挿入はだるいかも。publicに置かなきゃいけない。base64でもいいけど派手な画像だと文字列長すぎて視認性が死ぬ

## tailwind v4 を入れてみた

v5.2 から正式対応したらしい。
https://tailwindcss.com/docs/installation/framework-guides/astro
導入も簡単

## proseスタイリング

```ts
const rendered = await post.render();
const { Content, headings } = rendered;
```

こんなかんじ。contentは大文字。出力は `<Content/>`

## SSGならgetStaticPathが必要

`[slug].astro`としてると何のページを出力したらいいかわかんなくなるからルートを作っとく必要がある。

## 工夫

- ファイル自動生成によりコピペのめんどくささの解消（公開日、公開ステータスとか）→ hygen
- カテゴリとかを定数でもってzod検証
- satori, sharp

## SSG

- ホスティングくそ楽
- CDNなので初期スピード早い

### 欠点

- 再ビルドしないと反映されないコンテンツがある

## content/config.ts

定数読み込ませてたけど内容変わるたびにカテゴリが変わらんかった。再ビルドしないと更新されなかった
定数の内容は変わってるけど`config.ts`が明示的に変わってなくて起こる現象

## loaderで解決できそう？ Content Layer API

```ts
import { z, defineCollection } from "astro:content";
import { CATEGORIES } from "~/constants/categories";
import { PUBLISHED_STATUS } from "~/constants/published-status";

const posts = defineCollection({
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    categories: z.array(z.enum(CATEGORIES)),
    eyecatchUrl: z.string().optional(),
    eyecatchAlt: z.string().optional(),
  }),
});

export const collections = { posts };
```

```ts
categories: z.array(z.enum([...CATEGORIES])),
```

こうやった。確かにこれだと内部の数が増減したら変更されるようになったがタグ名変わったことを検知してくれない

## astroでconfig.tsに定数を渡したとき

定数の内容がキャッシュされず再ビルドしなくても反映されるようにする方法

## github urlを展開

シンプルにapiつかってコンテンツ取得してカードとして展開するだけ。mdのフロントマターにリポジトリ入力したらそれをもとにapiでとってくる

今回自分のリポジトリはprivateなのでトークン発行

## heygenで自動生成

自動生成するとき、まずpublishステータスを定数管理してたけど公開するとき書き換えるのだるかったのと、エディタで見たとき何が下書き中か一目瞭然なのがよくて/draftにデフォでいれるようにした
