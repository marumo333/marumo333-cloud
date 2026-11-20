---
name: reflect
description: 内省は親が learnings に短く書く。reflector subagent は起動しない。
---

# reflect skill

内省は親がその場で書く。`reflector` は起動しない。

再現できる判断だけ `docs/learnings.md` に日付付きで残す。リポジトリ全体の判断は `docs/decisions/` に残す。機能の判断は `features/<slug>/design.md` に残す。機能ごとに ADR、レビュー、proposed、admitted は作らない。

新しい周で `skill:reflect` を起動すると feature-gate が失敗する。
