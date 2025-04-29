---
title: Astro + microCMSで技術ブログを作成してSSRでホスティング
publishedAt: 2024-03-01
thumbnail: { src: "/images/thumbnail/filename-extension.png", alt: "" }
categories:
  - Astro
  - microCMS
  - headlessCMS
  - SSR
githubUrl: https://github.com/k-ito-cat/astro-microcms-blog/tree/main
---

ｓｓｒ対応（動的ルーティングのため）
amplify hostingを選んだ
公式サポートしてるアダプタがなかった

## 以前までの構成と問題点

以前までtechblogをmicroCMSでつないでたが、シンプルにmicroCMSが使い悪すぎた。

- md使えない
- エディタがバグる
- コードブロックとテーブルがあまりに使いにくい（コピペが許されない）

## 現状の方針

記事はAstro Markdownで管理することとし、microCMSは使わないが取っておく。
こちらのリポジトリで運用中

- aaa

### microCMSの利点

- APIベースなので、1つのアカウントで複数のwebサイト作成が可能
- 複数サイトを1つの管理画面で管理できる強み
- 個人ならブログや日記に良い
- 企業ならお知らせ管理やテックブログに良い
- 不特定多数に向けたコンテンツ発信に向いている

### microCMSの課題点

- Markdown形式が使えない（非エンジニア向けツールのため）
- iframe埋め込みが難しい（URLでの差し込みしか不可）
- たまにカーソルが当たらなくなるバグがある
- サイドメニューが閉じられない

# Astro SSR 構成

## 利用理由

- SSRにしたのは、SEOというより、任意のパスパラメータによる動的ルーティングを実現したかったから
- Astroは本来ウェブサイト向けだが、SSRによってウェブアプリのような使い方も可能

## セットアップ

- Astro create
- microcms-js-sdkのインストール
- microCMSのアカウント作成
- libs/microcms.tsにクライアントオブジェクト生成
- list取得APIの実装
- Astroではfetchをフロントマターで使い、静的HTMLにデータを埋め込む

## Astroでの技術設定

- エディタ：Prettier
- Style：Tailwind, Sass, Stylelint
- Linter：ESLint (flat config)
- Markdown Styling：@tailwindcss/typography + prose
- Fonts：fontsource
- Image最適化：Astro Image（ただしSSRではsharp未対応）

# セッション・非公開記事

- Astro v5.1のSession機能を活用し、ログイン状態や非公開記事制御を実現予定

## 作りたい機能

- プレビュー
- 記事のお気に入り
- microCMSのAPIとastroのSessionを掛け合わせてログインユーザーのみ非公開記事閲覧可能にする

# Astro SSR構成のメリット

1. SEO最適化：検索エンジンが最新記事を確実にクロール可能
2. 表示速度：初回は遅いがキャッシュで高速化可能
3. 動的ルーティングが可能

## SSGとの違い

- SSGではgetStaticPathsでルートを事前に定義する必要がある
- SSRであれば任意のslugでデータを取得してページ生成できる

# Amplifyにデプロイする際の課題と対策

- [NoAdapterInstalled] SSR用アダプタが存在しない → amplify-hostingには公式アダプタがない
- amplifyにはsharpが使えないため画像最適化は非対応
- build出力のサイズが大きすぎる → devDependenciesを除外（npm prune --production）

## Amplify SSR用のワークアラウンド

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - "npm ci --cache .npm --prefer-offline"
    build:
      commands:
        - "env >> .env"
        - "npm run build"
        - "npm prune --production"
        - "mv node_modules ./.amplify-hosting/compute/default"
        - "mv .env ./.amplify-hosting/compute/default/.env"
  artifacts:
    baseDirectory: .amplify-hosting
    files:
      - "**/*"
  cache:
    paths:
      - ".npm/**/*"
```

https://github.com/microcmsio/microcms-js-sdk/blob/main/README_jp.md#%E3%82%B3%E3%83%B3%E3%83%86%E3%83%B3%E3%83%84api

# プレビュー画面の実装

- contentId（記事ID）とdraftKey（下書き用キー）をクエリに含める
- previewページでその2つを取得し、getListDetailで該当記事を取得して表示

# Astro SSR ブログの設計ポイント

- Astroは仮想DOMを持たない → 反応的なUI制御にはReact導入も検討
- scriptはクライアント実行、フロントマターはサーバー実行
- コンテンツはフロントマターとMarkdownで管理し、コード管理による変更履歴追跡やGitによる運用が可能

# Astro + Markdown を選ぶ理由

- コード管理したい（Gitで履歴管理）
- 単独または少人数での運用
- 高機能エディタや画像管理が不要
- 技術記事・コードブロックが多い
- セキュリティ・速度に優れた静的ビルド

# 今後の拡張検討

- MDX対応
- Amplify + SSR環境での最適化
- Cloudwatchによるログ確認、プレビュー機能の充実

# 参考リンク

- https://docs.astro.build/ja/guides/routing/#サーバーssrモード
- https://github.com/microcmsio/microcms-js-sdk
- https://blog.microcms.io/astro-preview/
- https://docs.aws.amazon.com/ja_jp/amplify/latest/userguide/get-started-astro.html
