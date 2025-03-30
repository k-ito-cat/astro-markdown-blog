---
title: "z-indexとスタッキングコンテキストを理解する"
publishedAt: "2025-03-30"
githubUrl: ""
categories: ["CSS"]
---

## z-indexとスタッキングコンテキスト

z-indexを使用する中で、なかなか自分の思い通りにならずにデザインを実現するのに詰まることがあったので、
これを機会にz-indexの理解を深めたいと思います。

### スタッキングコンテキスト

z-indexを理解するにあたって重要な、スタッキングコンテキスト（重ね合わせコンテキスト）という概念があります。

スタッキングコンテキストはすべての要素が初めから持っているものではなく、ある条件を満たすとその要素自身に対して生まれ、その要素の子孫要素にも影響を及ぼします。

そしてそのスタッキングコンテキストには[生成される条件](https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context#%E8%A7%A3%E8%AA%AC)があります。

> 文書のルート要素 ( html )
>
> position の値が absolute または relative であり、かつ z-index の値が auto 以外の要素
>
> position の値が fixed または sticky の要素（sticky はすべてのモバイルブラウザーにありますが、古いデスクトップブラウザーにはありません）。
>
> container-type の値がコンテナークエリーのために size または inline-size に設定されているもの。
>
> フレックスコンテナーの子であり、 z-index の値が auto 以外の要素。
>
> グリッド (grid) コンテナーの子であり、 z-index の値が auto 以外の要素。
>
> opacity の値が 1 未満である要素（不透明度の仕様をご覧ください）。
>
> mix-blend-mode の値が normal 以外の要素。
>
> 以下のプロパティのいずれかが none 以外の値を持つ要素。
>
> transform
> filter
> backdrop-filter
> perspective
> clip-path
> mask / mask-image / mask-border
> isolation の値が isolate である要素。
>
> will-change の値が、初期値以外で重ね合わせコンテキストを作成する任意のプロパティを指定している要素（この記事を参照）。
>
> contain の値が layout または paint であるか、これらのどちらかを含む複合値（すなわち contain: strict, contain: content）を持つ要素。
>
> 最上位レイヤーに配置され、対応する ::backdrop がある要素。例えば全画面やポップオーバーの要素を含みます。

意外にも、opacityやtransformプロパティのnone以外の値が指定された時などはスタッキングコンテキストを新たに生成します。

※ 混乱しますが、スタッキングコンテキストが生成された要素の中でz-indexによる重なり順の操作が可能になるわけではないので、opacityやtransformの一部の指定ではスタッキングコンテキストが生成されるものの、位置指定要素やflexアイテム、gridアイテムではないのでz-indexが有効になりません。

### z-index

z-indexは[スタッキングコンテキスト内での重なり順を制御するためのもの](https://developer.mozilla.org/ja/docs/Web/CSS/z-index#%E8%A9%A6%E3%81%97%E3%81%A6%E3%81%BF%E3%81%BE%E3%81%97%E3%82%87%E3%81%86)です。

なので、スタッキングコンテキスト内でのみz-indexは影響を持ちます。

さらに、z-indexが有効な条件は

- [positionがstatic以外のものとその子孫要素](https://developer.mozilla.org/ja/docs/Web/CSS/position#%E5%80%A4)
- flexアイテムまたはgridアイテムであること（flexコンテナやgridコンテナの子孫要素が`z-index: auto`以外である時にスタッキングコンテキストを生成します）

の２つになります。

## 通常の要素の重ね合わせの規則

実際に例を見て重ね合わせの規則を確認していきます。

以下の例の通り、**div1**要素と**div2**要素があります。どちらもCSSで見た目を変えただけの、スタッキングコンテキストを持たない要素です。

一見してどちらも同じレイヤーに並んでいるように見えますが、このような単純な要素にも重なり順は存在します。

<iframe height="300" style="width: 100%;" scrolling="no" title="例1 - 1" src="https://codepen.io/k-ito-cat/embed/azbZREp?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/azbZREp">
  例1 - 1</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

上記のような要素の場合、div2に対して `margin-top: -50px;` をかけてdiv1とdiv2を重ねたとき、

<iframe height="300" style="width: 100%;" scrolling="no" title="例1 - 2" src="https://codepen.io/k-ito-cat/embed/jEOrevO?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/jEOrevO">
  例1 - 2</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

div2が前面に出ます（div1に対して`margin-bottom: -50px;`をかけても結果は同じです）。

これは、[HTML内での要素の出現順で、より後の要素が前のレイヤーに存在するという規則](https://arc.net/l/quote/zgfyiyps)によるものです。

> 位置指定なしの子孫ブロック、 HTML 内での出現順

これは単純な要素の重ね合わせの規則の一部ですが、位置指定要素（position）であるかどうかや、スタッキングコンテキストを持つ要素かどうかで規則がより複雑になるため、もう少し深掘りします。

### スタッキングコンテキストを持たない要素にz-indexを指定する

先ほどの例で言うと、div1はdiv2の下のレイヤーです。

このどちらの要素もスタッキングコンテキストを生成する要素でもなく、z-indexが使用できる要素でもないので、重なり順をz-indexで制御しようとしても順序は変わりません。

以下の例ではdiv1に `z-index: 10;` 、div2に`z-index: 1;` を生成しています。

結果としてはdiv2は、依然として前のレイヤーに存在しています。

<iframe height="300" style="width: 100%;" scrolling="no" title="例 1-3" src="https://codepen.io/k-ito-cat/embed/NPWrera?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/NPWrera">
  例 1-3</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

div1をdiv2の上に表示させたい場合は、スタッキングコンテキストを生成しつつ、z-indexが有効な要素でz-indexを指定する必要があります。

以下の例ではgridアイテムに対してz-indexを指定しています（gridコンテナの子要素にz-indexがauto以外が指定されているとき、スタッキングコンテキストが生成されます）。

<iframe height="300" style="width: 100%;" scrolling="no" title="例 1-4" src="https://codepen.io/k-ito-cat/embed/emYzbgQ?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/emYzbgQ">
  例 1-4</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

## 様々な要素の重ね合わせの規則

ここまで、スタッキングコンテキストの生成される条件や単純な要素の重ね合わせの規則について確認しましたが、

もう少し複雑な重ね合わせの規則があるので以下でそれを確認していきます。

ここでの重なり順は、z-indexの影響がない重なり順の規則を確認したいため、**z-indexがauto**であることを条件に見ていきます。

### HTML内の要素順

[HTML内の要素の順序](https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_without_z-index#:~:text=%E3%81%A9%E3%81%AE%E8%A6%81%E7%B4%A0%E3%81%AB%E3%82%82%20z%2Dindex%20%E3%83%97%E3%83%AD%E3%83%91%E3%83%86%E3%82%A3,%E8%A6%81%E7%B4%A0%E3%80%81%20HTML%20%E5%86%85%E3%81%A7%E3%81%AE%E5%87%BA%E7%8F%BE%E9%A0%86)によって、レイヤーが決まります。

- 単純な兄弟要素同士（スタッキングコンテキストを持たない要素同士や位置指定要素同士でない場合）
- static以外の位置指定要素同士の場合
- スタッキングコンテキストを持つ要素同士の場合
  - ※ 挙動的にはそうでしたが、明記されていないので確証はないです

などの条件のとき、HTML内での要素順の後ろの方にある要素が前のレイヤーに表示されます。（後に検証をしています）

この規則で重ね合わせの順序が決まる条件は、比較される要素同士が同じ要素の条件の時だけのようです（positionがstaticな要素同士、位置指定要素同士、スタッキングコンテキストを持つ要素同士など）。

### 位置指定要素（position）

positionのabsoluteやrelative、sticky、fixedなどが対象です。

基本的にstatic以外の位置指定要素はstaticな要素よりも前のレイヤーに配置されます。

[https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_without_z-index#例](https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_without_z-index#%E4%BE%8B)

ヘッダーなどでfixedを指定することがあると思いますが、無条件で前面に出るのはこの規則によるものです。

※ 位置指定要素同士の比較では、HTML内での出現順によってレイヤーが影響を受けるので、必ずしもfixedやstickyを指定した要素が最前面に来るとは限りません

### スタッキングコンテキストを持つ要素かそうでないか

スタッキングコンテキストを持つ要素はそうでない要素よりも前のレイヤーに表示されます。

検証の中で偶然見つけた規則なのでいまいち確証を持てないですが[それっぽいこと](https://www.w3.org/TR/CSS2/zindex.html#:~:text=The%20bottom%20of%20the%20stack%20is%20the%20furthest%20from%20the%20user%2C%20the%20top%20of%20the%20stack%20is%20the%20nearest%20to%20the%20user%3A)が書かれてるのでおそらくそういう規則はあるかと思います。

### 子要素であるかそうでないか

子要素や擬似要素は基本、親要素よりも前面にでます。

以下の例では、擬似要素である青い三角は、その親要素よりも全面にあることがわかります。

※ 以下の例が悪いですが、例では擬似要素に位置指定要素を指定しているので前のレイヤーにきてしまいますが、位置指定要素が指定されていなくても擬似要素は親要素よりも前のレイヤーにきます。

<iframe height="300" style="width: 100%;" scrolling="no" title="例 2-1" src="https://codepen.io/k-ito-cat/embed/pvobmpz?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/pvobmpz">
  例 2-1</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

ただ、場合によっては子要素を親要素よりも背面に配置したいことがあります。

例えば、擬似要素（青い三角）を`.blowing`（赤い色）より背面で、`.wrapper`（オレンジ色）よりも前面に配置したいとします。

このとき、なんとなく`.blowing`に`z-index: 99999`などの大きなz-indexを指定し、擬似要素に`z-index: 0`や`z-index: -99999`などの親要素のz-indexよりも低い値を指定すれば期待通りのレイヤー（`.wrapper` | 擬似要素 | `.blowing` | ← ユーザー目線）になるのではないかと想像しますが、そのようにはなりません。

`.blowing`要素と擬似要素はどちらも独立したスタッキングコンテキスト（`.blowing`はrelativeが指定されているのでz-indexのauto以外が指定された時点で新たなスタッキングコンテキストが生成され、擬似要素も同様にabsoluteに加えてz-indexのauto以外が指定された時点でスタッキングコンテキストを生成します）を持っていて、z-indexの値はそれぞれのスタッキングコンテキスト内での重なり順を決めるものなので、親要素のz-indexの数値より子要素のz-indexが低くても、それぞれのレイヤーは干渉しません。

※ MDNの例のdiv3とdiv4、div5の関係と同じ状況です。

https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_context#html

話を戻して、以下のコードの（オレンジ色の要素と赤色の要素はスタッキングコンテキストを持たない）状態で擬似要素に対して`z-index: -99999`をするとどうなるでしょうか。

<iframe height="300" style="width: 100%;" scrolling="no" title="例 2-2" src="https://codepen.io/k-ito-cat/embed/bNGeyrz?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/bNGeyrz">
  例 2-2</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

擬似要素は`.wrapper` （オレンジ色）要素の背面に周ります。

現時点での順序は以下のようになっているはずです。

html | 擬似要素 | `.wrapper` | `.blowing` ← ユーザー目線

ここから見てわかるように、z-indexに負の数を指定すると**スタッキングコンテキスト内でユーザー側から遠いレイヤーに配置**されます。

（オレンジ色の要素も赤色の要素もスタッキングコンテキストは無いですが、[html要素がスタッキングコンテキストを持ちます](https://arc.net/l/quote/tclxdpgv)）

この規則を利用すれば、

1. `.wrapper`に対してスタッキングコンテキストを生成する（この時点で子要素が親要素よりも背面に周ることがない）
2. そのスタッキングコンテキスト内で最もユーザー側から遠いレイヤーに擬似要素を配置する

このようにすることで、

html | `.wrapper` | 擬似要素 | `.blowing` | ← ユーザー目線

という期待通りのレイヤーを実現できます。以下がその例です。

（例ではopacityの1未満を指定して`.wrapper`にスタッキングコンテキストを生成していますが、スタッキングコンテキストを生成できればrelativeでもなんでもよいです）

<iframe height="300" style="width: 100%;" scrolling="no" title="例 2-3" src="https://codepen.io/k-ito-cat/embed/LEYZWjp?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/LEYZWjp">
  例 2-3</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

ちょっと混乱しますが、z-indexの負の数は無条件に親要素の背面に周す（そう思っていた）という意味ではなく、[スタッキングコンテキスト内でユーザーの目線から遠いところに位置する](https://www.w3.org/TR/CSS2/zindex.html#:~:text=and%20so%20forth.-,E.2%20Painting%20order,the%20top%20of%20the%20stack%20is%20the%20nearest%20to%20the%20user%3A,-%7C%09%20%20%20%7C%09%20%20%20%20%20%7C%09%20%20%7C%0A%09%20%20%20%20%20%7C%09%09%7C%20%20%20%20%7C%09%20%20%7C%09%E2%87%A6%20%E2%98%BB%0A%09%20%20%20%20%20%7C%09%09%7C%09%20%20%7C%09user%0Az%2Dindex)ということのようです。

## 様々な要素同士の重なり順の比較

要素には色々なものがありますが、色々な要素の重なり順がどうなっているかを確認します。

z-indexは重なり順を操作してしまうので、一部を除いてはz-indexはautoの状態で確認します。

gridアイテムやflexアイテムは、z-indexを指定して初めてスタッキングコンテキストを生成するので、z-indexの値をつけて検証しています。

以下のA、B、Cの要素は要素の特性がバラバラです。それぞれが色々な特性を持つ要素とどう重なるかを例として見ていきます。

<iframe height="300" style="width: 100%;" scrolling="no" title="例 3" src="https://codepen.io/k-ito-cat/embed/RNwRgQb?default-tab=html%2Cresult" frameborder="no" loading="lazy" allowtransparency="true" allowfullscreen="true">
  See the Pen <a href="https://codepen.io/k-ito-cat/pen/RNwRgQb">
  例 3</a> by cat (<a href="https://codepen.io/k-ito-cat">@k-ito-cat</a>)
  on <a href="https://codepen.io">CodePen</a>.
</iframe>

### 詳細

- **A. 位置指定要素**

スタッキングコンテキストを持たない位置指定要素です。

- **B. スタッキングコンテキストを持つ要素**

スタッキングコンテキストを持つ、positionがstaticな要素です。

- **C. スタッキングコンテキストを持つ位置指定要素**

スタッキングコンテキストを持ち、位置指定要素でもあります。

- **a. 通常の要素**

位置指定要素が指定されていないstaticな要素でかつ、スタッキングコンテキストを持たない要素です。

基本的に位置指定要素を持つ要素やスタッキングコンテキストを持つだけの要素（z-indexがautoでも）よりも下のレイヤーになります。

※ HTML順序によるレイヤーの重ね合わせの規則はこの時影響を受けていません（#HTML内の要素順）

- **b. transform translate｜c. opacityの値が 1 未満である要素**

※ この辺りは挙動を見て、という感じなので間違った解釈をしているかもしれません。

これはどちらもスタッキングコンテキストを新たに生成した要素です。

b,cがA,B,Cよりも前のレイヤーに出ているところを見ると、スタッキングコンテキストを持つ要素同士や位置指定要素を持つ要素同士の要素の重なり順は同じようで、最終的にHTML内の要素順で決定されている気がしています。

- **d. flex-container**

これは、flexコンテナ自身にz-indexを指定していますが、z-indexが有効なのはgrid・flexアイテムです。

このflexコンテナ自身に指定されたz-indexは意味をなさず、スタッキングコンテキストも生成されないので最も背面にきています。

gridコンテナも同様です。

- **e. flex-container2**

flexコンテナの子要素（フレックスアイテム）に対してz-indexを指定した時、そのflexアイテムはスタッキングコンテキストを生成します。

この要素はz-indexにauto以外の正の整数（`z-index: 99999`）が指定されているので、flexアイテムのみ位置指定要素より前面に出ています。

- **f. z-index**

z-indexのみを指定した要素です。位置指定要素でもなく、grid・flexアイテムでもないのでこのz-indexは意味をなしません。

positionはデフォルトでstaticなので、AとCの位置指定要素よりも後ろのレイヤーになります。（#位置指定要素（position））

また、この要素はスタッキングコンテキストを持たないので、Bのスタッキングコンテキストを持つ要素よりも下のレイヤーになります。

位置指定要素同士でもなければスタッキングコンテキストを持つ要素同士でもないので、HTML順序による重ね合わせの規則は適用されていません。

- **g. relative｜h. absolute**

static以外の位置指定要素同士の比較は、HTML内の順序による重ね合わせの規則にのっとります。（#位置指定要素（position））

g,hは位置指定要素ではありますがスタッキングコンテキストを持っていない要素です。同じ位置指定要素同士の重なり順はHTML順序によって決まることは明確ですが、スタッキングコンテキスト要素と位置指定要素同士も同様の重なり順とみなされて最終的にHTML順序によって決まっているのではないかと思っています（b,cの重なり順と同じ）。

## ブラウザで重なり順を確認できる

レイヤーを確認するChrome拡張機能などあるようですが、chromeやedgeの標準機能でも確認できるようです。
以下はChromeで、検証ツールを開いて command + shift + p で「Layer」と打ってタブを出して確認しています。
使ったことはないですが、Edgeの方が使いやすいらしいです。

![](/images/image01.png)

## 参考

z-index の使用
https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Using_z-index
z-index なしの重ね合わせ
https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_without_z-index
浮動要素の重ね合わせ
https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index/Stacking_floating_elements
Appendix E. Elaborate description of Stacking Contexts
https://www.w3.org/TR/CSS2/zindex.html
CSS の z-index を理解する
https://developer.mozilla.org/ja/docs/Web/CSS/CSS_positioned_layout/Understanding_z-index
