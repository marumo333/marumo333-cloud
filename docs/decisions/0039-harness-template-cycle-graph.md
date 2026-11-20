# ADR 0039: ハーネス制約と有界サイクルグラフ

- 状態: 受理
- 改正注記: 第3は [[0046]] で Muse medium。計画/レビューは [[0047]] で Fable 5.1。決定本文の「Opus ゲート」列挙は履歴。Sol は使わない。第4の下書き PR は 2026-11-20 に廃止し、作業 PR のマージ先へ記録を直接載せる。
- 日付: 2026-08-14
- 背景: 本リポは Cursor ハーネスのテンプレートである。対象は席・正本・ゲート・cycle に閉じる。
  自己改善は「人間がチャットを開く1周」しか無く、skill 省略も複製/送信後の再起も無い。
  無制限の自動再起は無制限再起防止（[[0033]]）と衝突する。
- 決定:
  1. **対象はハーネス制約。** 席は親 Grok + Opus ゲート（plan-confirm / 敵対レビュー /
     verifier / reflector）+ Muse は3体のみ（[[0046]]）。正本は Feature、ゲートは OPA、改善は cycle。
  2. **グラフは skill / Feature / cycle。** ノード=skill/feature/cycle、辺=受け渡し/承認、
     状態=used|skipped|failed|approved。正本イベントは `knowledge/graph/events.jsonl`。
  3. **3指標。** node_skip_rate / edge_skip_rate / state_integrity。閾値超過で Feature を proposed 起票。
  4. **再起は有界。** hooks から Task は起動しない（[[0033]]）。人間が作業の PR をマージしたあとだけ
     `cycle-after-merge` が承認と次周を、そのマージ先の `cycle/events.jsonl` へ直接載せる。
     記録用の PR は開かない。枝が `cycle/` のマージでは承認も次周も書かない。
     省略/失敗が無い周、未マージの cycle PR、未処理の cycle-followup Feature、
     または MERGED≠true なら開かない。空サイクルの integrity=0 だけでは再起しない。
     キー欠落は deny。`human_approved` は after-merge だけが書く。同じ merge_sha は二度書かない。
  5. **複製先の正本**は複製先の `knowledge/features/`。GitHub PR は鏡。テンプレートの使い方は `TEMPLATE.md`。
  6. **ハーネスを始める順。** clone → ADR で技術選定（テンプレート ADR を型に更新）→ Feature を proposed 起票
     → 起票 PR をマージ → 次 PR で実装。同一 PR で admitted にしない。実装から入らない。
- 結果: 空リポに複製/送信して人間がマージすると、省略が残っている限り次票が起票される。
  エージェント実行そのものは人間または Cloud Agent 起動が必要（Task 自動点火はしない）。
- 関連: [[0033-harness-api-budget-routing]] [[0038-feature-canon-opa-grow]] [[0016-definition-of-done]]
