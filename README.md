# 概要

Astro Content Collections を使用した Markdown 形式のブログ

管理画面（Sveltia CMS）もしくは直接markdownファイルを作成して記事の作成が可能

## リポジトリの構成

- [src/content/posts](src/content/posts) - ブログ記事の Markdown ファイルが格納されています（サブモジュールとして管理）
- [src/components](src/components) - Astro コンポーネント（記事表示、カード、カテゴリなど）
- [src/constants](src/constants) - カテゴリや公開ステータスなどの定数管理
- [src/layouts](src/layouts) - ページのレイアウト

## 主要設定ファイル

- [astro.config.mjs](astro.config.mjs) - Astro の設定ファイル
- [public/admin/config.yml](public/admin/config.yml) - Sveltia CMS の設定ファイル（リポジトリ連携、コンテンツモデル定義）
- [netlify.toml](netlify.toml) - Netlify ビルド設定など
- [.gitmodules](.gitmodules) - Git サブモジュール設定
- [src/content/config.ts](src/content/config.ts) - Astro Content Collections のスキーマ定義
- [.github/workflows/update-submodule.yml](.github/workflows/update-submodule.yml) - サブモジュール自動更新のワークフロー

## 用意している npm script

- `npm run new:post` - 新規ブログ投稿のテンプレートを作成（hygen）
- `npm run posts:board` - 記事を `status` 別に集計し、メモ欄の状態を確認
- `npm run update` - git pull とサブモジュール更新を実行
  - 管理画面でcommitが進むことがほとんどなので、このプロジェクトで何らかの修正を加える前に最新化する目的
  - 将来的にpre-pushで実行するなど自動化を考える
- `npm run copy-images` - 画像を public ディレクトリにコピー ビルド時に行っている
  - `src/content/posts`をサブモジュール化している兼ね合いで、記事のサムネイルや記事内の画像も同じリポジトリでgit管理したいが、publicにおかないと画像を表示できないのでbuild前に`src/content/posts/images`の内容を`public/images`にコピーしている
  - 基本的に開発サーバー起動時とビルド時に実行されるようにしているので意識して実行はしなくて良い

## 記事の管理方法

### ステータス運用

記事の公開状態は frontmatter の `status`、執筆状態は `writingStatus`、取り組む順序は `priority` で管理する。3つの値を分け、公開可否・執筆工程・優先順位を独立して変更できるようにする。

`status` は公開側での表示状態を表す。

- `private`: 非公開。公開側の一覧に表示しない
- `draft`: 公開中（WIP）。公開側の一覧には表示するが、本文は下書き表示にする
- `published`: 公開済み。完成記事として公開する

`writingStatus` は次の順序で確認する。

- `writing`: 執筆中
- `planned`: 執筆予定
- `todo`: 未着手
- `done`: 執筆完了

`priority` は次に取り組む順序を表す。

- `high`: 高。次に優先して進める
- `medium`: 中。高優先度の後に進める
- `low`: 低。保持するが当面急がない
- `none`: 未設定。優先順位をまだ判断していない

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

### 1. エディタで直接編集

1. `npm run new:post` を実行してテンプレートを生成
2. 生成されたファイルを編集
3. 変更を commit して push

### 2. 管理画面（Sveltia CMS）から編集

1. `/admin` にアクセス
2. GitHub OAuth 認証
3. 管理画面から記事を作成・編集
4. 「Publish」ボタンで変更を適用

## サブモジュール管理

このリポジトリは記事を別リポジトリ（private）としてサブモジュール管理している

- サブモジュールとしているリポジトリに変更があると GitHub Actions で自動的に親リポジトリにイベントが通知される
- 親リポジトリ側でイベントを検知して、自動的にポインタを更新・コミット
  - mainブランチが更新されるのでnetlifyのdeployが走る

## 画像管理

- SveltiaCMSでuploadした画像は [src/content/posts/images](src/content/posts/images) に保存時にコミットされる（配置場所は/admin/config.yml参照）
- ローカルサーバ起動時 & ビルド前に [src/content/posts/images](src/content/posts/images) の内容が [public/images](public/images) にコピーされるようにコマンドを実行しているため、ローカルサーバ起動時やデプロイ後はAstroテンプレートからpublicの画像を参照している。

## メンテナンス

### カテゴリを追加したいとき

- [src/constants/categories.ts](src/constants/categories.ts) - フロントマターでのバリデーションで使われる（主にエディタ編集時に活用）

- [public/admin/config.yml](public/admin/config.yml) - 管理画面でカテゴリ選択時のサジェスト

### フロントマターを変更するとき

- [public/admin/config.yml](public/admin/config.yml) - 管理画面カスタマイズ
- [src/content/config.ts](src/content/config.ts) - スキーマ
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
