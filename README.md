## ブログテンプレートの作成

```sh
npm run new:post
```

生成するファイル名と投稿タイトルを入力後、/content/posts/draft に md ファイルが生成される（/draft 下は下書きステータスとなる）

## 定数

/constants でカテゴリなどの定数を管理する

## 公開ステータス

公開ステータス「published」は公開、「draft」は下書きとなり、「draft」の記事は表示されない

/content/posts にファイルを移動して公開状態にする
