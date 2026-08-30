# 概要

Astro Content Collections を使用した Markdown 形式のブログ

記事はエディタでの直接編集、またはローカルのプレビュー画面のインライン編集で作成する

## リポジトリの構成

- [src/content/posts](src/content/posts) - ブログ記事の Markdown ファイルが格納されています（サブモジュールとして管理）
- [src/components](src/components) - Astro コンポーネント（記事表示、カード、カテゴリなど）
- [src/constants](src/constants) - カテゴリや公開ステータスなどの定数管理
- [src/layouts](src/layouts) - ページのレイアウト

## 主要設定ファイル

- [astro.config.mjs](astro.config.mjs) - Astro の設定ファイル
- [netlify.toml](netlify.toml) - Netlify ビルド設定など
- [.gitmodules](.gitmodules) - Git サブモジュール設定
- [src/content.config.ts](src/content.config.ts) - Astro Content Collections のスキーマ定義
- [.github/workflows/update-submodule.yml](.github/workflows/update-submodule.yml) - サブモジュール自動更新のワークフロー

## 用意している npm script

- `npm run new:post` - 新規ブログ投稿のテンプレートを作成（hygen）
- `npm run posts:board` - 記事を `status` 別に集計し、メモ欄の状態を確認
- `npm run images:prune` - どの記事からも参照されていない画像を削除（`--dry-run` で確認のみ）
- `npm run posts-update` - git pull とサブモジュール更新を実行
  - 記事側リポジトリだけが先に進むことがあるため、このプロジェクトで何らかの修正を加える前に最新化する目的
  - 将来的にpre-pushで実行するなど自動化を考える

## 記事の管理方法

### ステータス運用

記事の公開状態は frontmatter の `status`、執筆状態は `writingStatus`、取り組む順序は `priority` で管理する。3つの値を分け、公開可否・執筆工程・優先順位を独立して変更できるようにする。

`status` は公開側での表示状態を表す。

- `private`: 非公開。公開側の一覧に表示しない
- `draft`: 公開中（WIP）。公開側の一覧ではWIPとして識別できる状態で表示し、本文は下書き表示にする
- `published`: 公開済み。完成記事として公開する

`writingStatus` は次の順序で確認する。

- `writing`: 執筆中
- `planned`: 執筆予定
- `todo`: 未着手
- `on_hold`: 保留
- `done`: 執筆完了

`priority` は次に取り組む順序を表す。

- `high`: 高。次に優先して進める
- `medium`: 中。高優先度の後に進める
- `low`: 低。保持するが当面急がない
- `none`: 未設定。優先順位をまだ判断していない

### カテゴリとタグ

記事の分類は `categories` と `tags` の2軸で持つ。どちらも必須で、値は定数に定義されたものだけを使える（未定義の値を書くとbuildが落ちるので、表記ゆれはbuild時に検知できる）。

`categories` は「記事を辿るための分野」を表す。**1〜2件必須**。技術名や製品名は入れない。

- 定義: [src/constants/categories.ts](src/constants/categories.ts)
- 値: `フロントエンド` / `バックエンド` / `Web基盤` / `セキュリティ` / `設計・アーキテクチャ` / `開発環境・ツール` / `AI` / `UI・UX` / `開発プロセス`

`tags` は「固有名詞と個別の論点」を表す。**1件以上必須**、件数の上限はない。

- 定義: [src/constants/tags.ts](src/constants/tags.ts)
- 例: `Astro` / `TypeScript` / `devcontainer` / `GitHub Actions` / `認証・認可` / `パフォーマンス`

```yaml
categories:
  - フロントエンド
tags:
  - Astro
  - Headless CMS
```

索引ページでは `categories` を「分野」、`tags` を「タグ」として別々に並べる。絞り込みは検索ボックスに一本化していて、分野やタグをクリックするとその値が検索語として検索ボックスに入る（ページ遷移はしない）。検索はタイトル・分野・タグをまとめたテキストを対象にし、スペース区切りで複数語を入れるとAND条件になる。記事詳細の分野・タグからは `/blog?q=<値>` へ遷移し、同じく検索語として扱われる。

記事詳細の「近い分野・タグの記録」は、`共通タグ1件につき2点 + 共通カテゴリ1件につき1点` で採点し、2点以上の記事を上位3件まで表示する。同じカテゴリが1つ重なるだけでは関連として扱わない。`relations` を明示した場合は、そちらと併記される。

### 技術理解の関係・改訂

公開・執筆運用とは別に、必要な記事だけ以下の任意frontmatterを持てる。既存記事へ追加する必要はなく、未入力の場合も従来どおり表示・buildできる。

`relations` は記録同士がなぜつながるかをslugで表す。

```yaml
relations:
  prerequisites:
    - http-cache
  related:
    - cache-control
  developments:
    - conditional-requests
  replacements:
    - older-http-note
```

`revisions` は知識が変化した過程を記録する。

```yaml
revisions:
  - date: "2026-08-16"
    summary: "RFCへの参照と検証結果を追加"
```

公開画面では`updatedAt`が`publishedAt`より新しい記事を「改訂」として時間軸へ表示する。改訂内容と置換関係は推測せず、frontmatterに明示された場合だけ表示する。

状態ごとの件数は次のコマンドで確認する。

```bash
npm run posts:board
```

対象記事も表示する場合は `--detail` を付ける。

```bash
npm run posts:board -- --detail
```

### ローカルプレビュー

`private` / `draft` の記事本文をレンダリングして確認したい場合は、開発サーバーを起動してローカルプレビューを見る。

```bash
npm run dev
```

```txt
http://localhost:4321/preview/posts
```

`/preview/posts` は全記事を初期表示するテーブル形式で、優先度・執筆状態・公開状態ごとのグルーピングを切り替えられる。タイトル・カテゴリ・slugの検索、各メタデータによる絞り込み、並び替えに対応する。表示条件はURLに保存され、再読み込み後も維持される。タイトルをクリックすると、通常の記事詳細と同じ表示コンポーネントで本文を確認できる。

このプレビューはローカル確認用で、本番ビルドでは preview ページを生成しない。公開側の `/blog` は従来通り `private` を除外する。

記事にメモを残す場合は、Markdown の末尾に次の固定見出しでメモ欄を置く。

```md
## メモ

ここにメモを書く
```

メモ欄は Markdown として表示され、記事プレビュー上では細い罫線で本文と区別される。執筆素材として保持し、本文へ書き起こしてから公開する想定。`private` と `draft` ではメモを保持してよいが、`published` にするとメモも本番ページへ表示される。プレビュー一覧の警告を確認し、メモ欄を削除するか公開状態を変更する。

`posts:board` は `status`、`writingStatus`、`priority`を集計し、メモ欄の状態を補助情報として表示する。

- `## メモ` 見出しがある: メモ欄あり
- メモ欄の中に空白以外の文字がある: `HAS_MEMO`
- メモ欄の中が空、または空白だけ: `EMPTY_MEMO`
- メモ欄がない: `NO_MEMO`
- `## メモ` 見出しが複数ある: `BROKEN_MEMO`
- メモ欄は1記事につき1つだけ置く

### Obsidianで編集

記事リポジトリはObsidianでの編集に対応している。親リポジトリ全体ではなく、サブモジュールの `src/content/posts` を既存のVaultとして開く。

Vaultには、Astroとの相互運用に必要な設定を含む `.obsidian` の一部を追跡している。

- Wikilinkではなく標準のMarkdownリンクを使用する
- 新しい添付ファイルを `images` に保存する
- `.obsidian` 内では `app.json`、`appearance.json`、`core-plugins.json` だけをGit管理する
- Community Pluginは必須としない

画像は `src/content/posts/images` に置き、本文からは `../images/...` の相対パスで参照する。相対参照にすることで Astro の画像最適化（WebP変換・`srcset` 生成・`width`/`height` 付与）に載る。Obsidianで画像を貼り付けた後は、本文に生成された画像URLが `../images/...` になっていることを確認する。

### 1. エディタで直接編集

1. `npm run new:post` を実行してテンプレートを生成
2. 生成されたファイルを編集
3. 変更を commit して push

### 2. プレビュー画面から編集

1. `npm run dev` で開発サーバを起動
2. `/preview/posts/<slug>` を開く
3. フロントマター・本文・画像をインラインで編集（保存すると Markdown に直接書き戻される）

一覧や絞り込みの挙動は「ローカルプレビュー」を参照。

## サブモジュール管理

このリポジトリは記事を別リポジトリ（private）としてサブモジュール管理している

- サブモジュールとしているリポジトリに変更があると GitHub Actions で自動的に親リポジトリにイベントが通知される
- 親リポジトリ側でイベントを検知して、自動的にポインタを更新・コミット
  - mainブランチが更新されるのでnetlifyのdeployが走る

## 画像管理

- 画像の正本は [src/content/posts/images](src/content/posts/images)（サブモジュール `blog-posts` 側）。プレビュー画面のツールバーから追加した画像もここに保存される
- 本文からは `../images/xxx.png` の相対パスで参照する。`src/` 配下の相対参照だけが Astro の最適化対象になるため、`/images/...` の絶対パスは使わない
- ビルド時に `dist/_astro/` へ WebP 化・複数サイズで出力される。`public/images` へのコピーは廃止した
- OG画像は記事の `thumbnail` が空なら [src/assets/og-default.png](src/assets/og-default.png) にフォールバックする
- どの記事からも参照されなくなった画像は、dev サーバー起動時に自動で削除される（[src/plugins/imagePruner.mjs](src/plugins/imagePruner.mjs)）。記事の削除で孤児になった画像も対象
  - 記事の保存時には削除しない。Astro が生成するアセットマップの再生成がデータストアの更新より遅れるため、保存の途中で画像を消すと `ImageNotFound` になる
  - 手動で掃除する場合は `npm run images:prune`。`--dry-run` を付けると対象を表示するだけで削除しない

## メンテナンス

### カテゴリ・タグを追加したいとき

カテゴリとタグはどちらもenum運用のため、定数に無い値は使えない。追加するときは以下の2箇所を同時に更新する（二重管理）。

- [src/constants/categories.ts](src/constants/categories.ts) / [src/constants/tags.ts](src/constants/tags.ts) - フロントマターでのバリデーションで使われる（主にエディタ編集時に活用）

カテゴリは分野を表すため、増やす前に既存の9件で表せないかを先に検討する。技術名・製品名・個別の論点はカテゴリではなくタグに追加する。

### フロントマターを変更するとき

- [src/content.config.ts](src/content.config.ts) - スキーマ
- [\_templates/generator/new/index.ejs.t](_templates/generator/new/index.ejs.t) - hygenによって生成するmdファイルのテンプレート（主にフロントマター部分）

場合によっては定数の追加

- [src/constants/](src/constants/)

### posts配下の変更後

1. サブモジュール側（posts）のmainブランチ上で修正したMarkdownをコミット
2. サブモジュール側でpush（origin/main に紐付いている状態で）
3. スーパープロジェクト側でサブモジュールポインタをコミット
4. スーパープロジェクト側でpush

> [!warning]
>
> VSCodeまたはCursorでサブモジュールのファイルを選択すると左下のプロジェクト名が「posts」になる。その隣がコミットハッシュ表示＝detached HEAD(ブランチを指してない状態)のときは、mainブランチへ切り替えてからコミット・pushを行う。
>
> 既にdetached HEADでコミットしてしまった場合は、ブランチに載せ替えてからpushするか、`git push origin HEAD:main` でリモートのmainへ反映する。

## remark

マークダウンで以下の形で書くことでコールアウトを生成する

```
> [!WARNING]
> これは警告メッセージです
```

> [!WARNING]
> これは警告メッセージです

```
> [!NOTE]
> これは情報メッセージです
```

> [!NOTE]
> これは情報メッセージです

```
> [!CAUTION]
> これは危険メッセージです
```

> [!CAUTION]
> これは危険メッセージです

```
> [!TIP]
> これは便利なヒントです
```

> [!TIP]
> これは便利なヒントです

```
> [!IMPORTANT]
> これは重要な情報です
```

> [!IMPORTANT]
> これは重要な情報です
