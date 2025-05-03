## Decap CMS　でMarkdownの作成

test

## CLIでブログを作成する場合のブログテンプレートの作成

hygenで固定のフロントマターを含んだブログテンプレートを生成するコマンドを実行する

```sh
npm run new:post
```

生成するファイル名と投稿タイトルを入力後、`src/content/posts/draft` に md ファイルが生成される

## カテゴリの管理

`src/constants` でカテゴリを定数で管理する

## 公開ステータス

公開ステータス「published」は公開、「draft」は下書きとなる

「draft」の記事はブログ上には表示されない

`src/content/posts` 直下にあるMarkdownファイルは公開状態となり、`src/content/posts/draft` 直下にあるMarkdownファイルは下書き状態となり、ブログ上に公開されない
