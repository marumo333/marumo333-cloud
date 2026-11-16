---
name: code-mode
description: 照会 bash を1回の CLI にまとめ、中間出力を文脈に載せない（Uber code-mode / read_cache）。2本以上の git status/diff/log などで使う。
---

# code-mode skill（[[0048]]）

2 本以上の**照会** bash は、別 turn や生の `&&` で回さない。
`node scripts/code-mode.mjs --step '…' --step '…'` を **1 回**だけ呼ぶ。

## やること

```bash
node scripts/code-mode.mjs \
  --step 'git status -sb' \
  --step 'git diff --stat' \
  --step 'git log -5 --oneline'
```

返り値は JSON 要約（`stdout_tail` / exit / bytes）だけ。中間の全文は捨てる。
上限超過は truncate せず失敗する。空の step は拒否される。

単発の照会（`git status` だけ）はそのまま Shell でよい。
`git add && git commit` は code-mode 強制ではない。commit-guard は step 内も見る。

## やってはいけない

- 照会を turn ごとにバラす（read_cache の prefix が太る）。
- hook を迂回して生の `git status && git diff` を送る。
- hooks から Task を起動する。
- Anthropic の cache TTL を正本に書く。

使ったら `cycle` に任意記録してよい。必須ノードではない。
