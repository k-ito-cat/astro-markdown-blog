---
title: "[WIP] 解像度 画像 Retinaディスプレイ"
publishedAt: "2025-04-20"
thumbnail: { src: "/images/thumbnail/noimage.png", alt: "" }
githubUrl: ""
categories: ["IT基礎", "Apple", "ハードウェア"]
---

## Retina ディスプレイを知る前に

まずは解像度や画素などといったビットマップ画像周辺の基礎的な知識を知る必要がある

<a href="https://ja.wikipedia.org/wiki/%E8%A7%A3%E5%83%8F%E5%BA%A6" target="_blank" rel="noreferrer">解像度 - Wikipedia</a>

> 解像度（かいぞうど、英: resolution）とは、ビットマップ画像における画素の密度を示す数値である。
>
> すなわち、画像を表現する格子の細かさを解像度と呼び、一般に1インチをいくつに分けるかによって数字で表す。
>
> resolutionは分解能の意味も持つ。

解像度はビットマップ画像（ピクセルを用いた画像の表現形式）

## 画像の表現形式

### ビットマップ（ラスター）画像

ビットマップ画像の格子の細かさを解像度と呼ぶ。**1インチあたりいくつのピクセル（画素）が存在するかどうか**を数字で表す。

主な形式はPNG, JPEG, JPG, GIF, TIFF, WEBP, HEIF/HEIC, RAWなどがある

それぞれの特徴

### PDF

<a href="https://ja.wikipedia.org/wiki/Portable_Document_Format" target="_blank" rel="noreferrer">PDFについてのWikipedia記事</a>


OSやハードウェアなどの環境に左右されずどの環境でも同じ様子のデータを閲覧することができるファイル

Adobeが開発したフォーマットらしい。

### ベクター画像

ピクセル（画素）で図形を定義するわけではないので、ベクター画像事態に解像度という概念はない。

主な形式はSVG, AI（Adobe illustrator）, EPS, PDFなどがある

これらは数学的な表現形式なので、拡大や縮小による劣化がされない。拡大・縮小のたびに再計算されてる？

## Retina ディスプレイ とは

<a href="https://ja.wikipedia.org/wiki/Retina%E3%83%87%E3%82%A3%E3%82%B9%E3%83%97%E3%83%AC%E3%82%A4" target="_blank" rel="noreferrer">RetinaディスプレイについてのWikipedia記事</a>

> Retinaディスプレイ（レティナディスプレイ、レティーナディスプレイ、英: Retina Display）は、Apple製品のうち、100 - 160ppi程度であった従来のディスプレイ解像度の、およそ倍の解像度、高画素密度のディスプレイを指す名称である。「Retina」（レティナ）は英語で「網膜」という意味で、画素が細かく人間の目で識別できる限界を超えている[1]、ことから命名された。

日本語で言う「網膜」という名の通り、
画素数(dpi - 1インチあたりどのくらいピクセルが存在するか)

Retinaディスプレイの搭載モデルは2010年6月に発売されたiPhone4以降で搭載されている。


