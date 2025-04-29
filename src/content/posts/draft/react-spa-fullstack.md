---
title: "React Router v7 + FastifyでフルスタックSPA"
publishedAt: "2025-03-30"
githubUrl: ""
categories: []
---

# 目的

SPA 開発の FE 開発を包括的に学ぶ

# 技術スタック

| カテゴリ       | 使用技術                                                 |
| -------------- | -------------------------------------------------------- |
| フロントエンド | React, React Router v7, Shadcn UI, React Hook Form, Zod  |
| バックエンド   | TypeScript + Express                                     |
| API            | AWS Lambda, REST API, OpenAPI Specification (Swagger UI) |
| 認証・認可     | AWS Cognito（JWT 発行・管理）                            |
| データベース   | MySQL, Prisma ORM                                        |
| ストレージ     | Amazon S3（署名付き URL を利用した画像アップロード）     |
| インフラ       | Docker, AWS Amplify Hosting                              |
| CI/CD・品質    | GitHub Actions, Lefthook, ESLint, Prettier               |
| テスト         | Vitest, Playwright                                       |

昨今、ssrやサーバーコンポーネントなど相まってFEでもbeの知識が求められる。api駆動でもAPIの知識必要だしdbをしらんとapi設計もままならない

だから包括的に勉強してる

幸いにも、awsがcdk作ってくれたりして包括的にやりやすい環境が整ってる（amplify, cognitoとか）

## 機能

- ページネーション（リンクヘッダー対応）
- タブごとの絞り込み（例：/posts?tab=popular）
- スケルトンローディング
- 無限スクロール（Intersection Observer）
- タブUI・フィルター・ソート
- 絞り込み検索（パラメータ検証とか）

### 認証・状態管理

認証済みページのガード処理（Protected Route）

ログイン状態の永続化（Cookie or localStorage + Context）

グローバルステート（useContext, Zustand, Reduxのどれか）

セッション切れの自動リダイレクト

### フロント実装でのよくある技術

カスタムフックでAPI呼び出しを共通化(/apiとか)

Suspense + ErrorBoundary でエラー/ローディング処理

レスポンシブ対応（Tailwind / media queries）

### データ・ストレージ連携

画像アップロード（プレビュー表示）- presigned url

APIからのデータフェッチ＋表示

クエリパラメータからの絞り込み

## ディレクトリ設計

feature-based

/apiはフェッチ処理、結果の取得と整形やレスポンスを返すのはhooks

エラーをキャッチして独自えらーをかえすのは/api, hooksでは独自えらーをもとにloadingをtrueにするのか遷移先を渡すのかとかする

## パッケージ管理を明確に

dependenciesは本番環境（ランタイム）で必要なもの（コードで直接呼び出すもの？）

devDependenciesはローカルやCI/CDのみで必要なもの

## ライブラリ

### ESLint

これは現時点でtailwind v4未対応だからいれない
https://github.com/francoismassart/eslint-plugin-tailwindcss

v9からのflatconfigを使う

'React' must be in scope when using JSXeslintreact/react-in-jsx-scope

import React from "react";が必要だったがReact17以降、不要。なのでデフォでONになってるこの設定はオフにしておく

```json
{
  "rules": {
    "react/react-in-jsx-scope": "off"
  }
}
```

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.experimental.useFlatConfig": true
}
```

vscodeでcommand+Sで実行させとく

https://eslint.org/docs/latest/use/command-line-interface#options

eslintをcliで実行するためにpackage.jsonに追記します。のちにCIで動かすためです。ローカルではlefthookでgit hookを使って検証します（環境差異とかあるから一応二重に。）

### prettier

prettier,tailwindcssソートの
prettier-plugin-tailwindcss
を導入

.prettierrcを作成

// code

.prettierignoreを作成

// code

### tailwind

v4いれる
何が変わった？
