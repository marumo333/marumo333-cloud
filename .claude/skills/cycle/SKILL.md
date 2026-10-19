---
name: cycle
description: 1周の skill 使用/省略をグラフに記録し、3指標を出す。ループ終了時に必ず使う。
---

# cycle skill（[[0039]]）

hooks から Task は起動しない。親が各 skill のあと（または Stop 前）に記録する。

## 必須ノード（`cycle/required-cycle.json`）

`harness-api-budget`

`adversarial-review` / `verify` / `reflect` は必須ではない。新しい周で verify と reflect を起動すると feature-gate が失敗する。

使ったら:

`node scripts/cycle-record.mjs --type node_state --cycle C-0001 --node skill:<name> --state used`

使わなかったら `--state skipped`。失敗は `--state failed`。

辺（受け渡し）:

`node scripts/cycle-record.mjs --type edge_state --cycle C-0001 --from skill:verify --to skill:reflect --state taken|skipped --reason '...'`

## ディスパッチと観測（[[0045]]）

親が子を起動する直前:

`node scripts/harness-query.mjs --cycle C-NNNN --node skill:harness-api-budget --context-mode packet --adr docs/decisions/0045-dispatch-context-packet.md`

`node scripts/cycle-record.mjs --type dispatch --cycle C-NNNN --node skill:harness-api-budget --seq 1 --seat parent --escalate stay --sha256 <packetのsha256>`

周の観測（`$` は書かない。`need_rerun` に足さない）:

`node scripts/cycle-record.mjs --type token_ledger --cycle C-NNNN --seat parent --effort medium --packet-bytes N --tasks N --zero-value-reinject false`

## 集計

`node scripts/cycle-metrics.mjs --cycle C-0001`

`degraded=true` は指標が落ちた印である。Feature 票は作らない。reflector は起動しない。
token_ledger は観測項だけ。3指標には入れない。

## 再起

人間が PR をマージしたあと `cycle-after-merge` は承認を記録し、次の cycle を `after-merge` で開く。Feature は起票しない。
`human_approved` は CLI から書かない。
