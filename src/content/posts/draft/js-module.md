---
title: "js-module"
publishedAt: "2025-04-06"
categories: []
---

## module

type: "module"はモジュール形式を表す
module → ES module
commonjs → CommonJS


### ES module

Ecmascript

import/exportとか使える

### Common js

requireとか使える


## 差異はバンドラが吸収する

esbuildやRollupが該当するバンドルツール

## Vite

run dev, run buildでは使用されるバンドルツールが異なる
devではesmodule, prdではRollupらしい
