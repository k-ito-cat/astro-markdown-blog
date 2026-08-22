---
to: src/content/posts/blog/<%= fileName %>.md
---

---
title: "<%= title %>"
publishedAt: "<%= new Date().toISOString().split("T")[0] %>"
updatedAt: "<%= new Date().toISOString().split("T")[0] %>"
thumbnail: "/images/thumbnail/noimage.webp"
githubUrl: ""
# categories は src/constants/categories.ts の値から1〜2件（必須）
categories: []
# tags は src/constants/tags.ts の値から1件以上（必須）。無ければ定数に追加する
tags: []
# status: draft | private | published
# writingStatus: writing | planned | todo | done
# priority: high | medium | low | none
status: "private"
writingStatus: "todo"
priority: "none"
# verificationStatus: in_progress | verified | needs_review
# verificationStatus: "in_progress"
# relations:
#   prerequisites: []
#   related: []
#   developments: []
#   replacements: []
# revisions:
#   - date: "<%= new Date().toISOString().split("T")[0] %>"
#     summary: "初版"
---

ここに本文を書く

## メモ
