# ADR 0047: 計画確定と敵対レビュー＝Fable 5.1 high

- 現行: 席は役割（親・実装・計画・レビュー）だけを見る。モデル ID は指定しない。この本文は世代の記録である。

- 状態: 受理（改正対象: [[0016]] [[0018]] [[0026]] [[0031]] [[0033]] [[0037]] [[0039]] [[0040]] [[0044]] [[0046]]。廃止ではない）
- 改正注記: 決定2の Opus 5 と決定3の Grok 4.6 は [[0049]] で世代だけ更新（Opus 5.5 high / Grok 4.7 high）。席の役割は変えない。決定本文は履歴。
- 日付: 2026-09-11
- 背景:
  plan-confirm と単独敵対レビューは Opus 5 固定だった。人間が
  「計画は Opus で足りるか。レビューは Fable 5.1 の方が的確」と指示した。
  CursorBench 4.0 でも Fable 5.1 は先頭帯。短文の計画破壊とレビューは、
  同じ「抜けを見つける」仕事なので席を分ける理由が薄い。
- 調査:
  - Fable は Anthropic。trio に Opus を残すと 0037 の同居禁止に当たる。
    体1を Fable にし、Opus は trio から外す。
  - verifier / reflector は機械判定と内省。単価は Opus の半分。ここは Opus のまま。
  - Fable はガードに当たると Opus へ落ちる。独立が消えるので、落ちたら failed。
  - 第3は [[0046]] の Muse medium。運用ピンから Sol を外す。0044 決定本文の完走条件は消さない。
  - Task スラッグ `claude-fable-5-1-thinking-high` は allowlist にあり、この切替 PR の
    モード2 体1で実起動した（agent `bc-4666b579-bddf-53e0-b379-82f8029e722e`）。
- 決定:
  1. **plan-confirm と敵対レビュー（モード1・trio 体1）= `claude-fable-5-1-thinking-high`。**
  2. **verifier / reflector = Opus 5 のまま。**
  3. **`review_trio` = Fable 5.1 high / Grok 4.6 / Muse medium。**
     Fable と Opus を同一 trio に置かない（[[0037]]）。
  4. **Fable の Opus フォールバックは failed。** 黙って体1を Opus にしない。
     体1起動後、親は返ってきた実効モデルを確認する。Opus に落ちていたら
     `skill:adversarial-review` を cycle で failed にし、多数決に入れない。
  5. **天井**は Fable extra-high / max の追加レビューだけ。ゲート既定の代替にはしない。
  6. **0031 / 0033 / 0037 / 0040 / 0044 は廃止しない。** 決定本文は履歴として残し、改正注記と
     criteria / skill / agent の `model:` だけを現行ピンにする。
  7. **0040 の「席の役割が変わらないこと」。** 人間が計画/レビューと検証/内省を分けよと
     指示したので、今回だけ免除する。文書だけ先に書き換えない条件は、
     allowlist 実在 + この PR のモード2 体1実起動で満たす。
  8. **適用経路。** F-0009 は `proposed`（出生規則）。同一 PR の canon 適用は
     F-0001（`in_progress` / `supersede_adr: true`）の被覆。F-0003 + [[0040]] / F-0008 + [[0046]] と同じ。
- 結果: 計画とレビューは Fable、検証と内省は Opus、第3は Muse。親は Grok。
- 関連: [[0016]] [[0018]] [[0031]] [[0033]] [[0037]] [[0039]] [[0040]] [[0044]] [[0046]]
