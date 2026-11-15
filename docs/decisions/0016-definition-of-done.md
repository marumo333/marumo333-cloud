# ADR 0016: 完了の定義

- 状態: 受理（改正: [[0037]] [[0038]] [[0039]] [[0041]] [[0042]] [[0046]] [[0047]] [[0049]] [[0051]]）
- 改正注記: 完了は `node scripts/feature-gate.mjs` と、ハーネスにテストがある変更の `pnpm test`。Feature の被覆はしない。3体レビューはしない。内省は `docs/learnings.md`。cycle の記録は `cycle/events.jsonl`。品質の例外は `cycle/code-quality.yaml`。画面の差分は、親が操作したスクリーンショットか録画と、各画面ファイルの sha256 が `cycle/runtime-verify.jsonl` に無いと feature-gate が失敗する。中身が変わった古い行は覆わない。code-review と security-reviewer は毎タスクでは起動しない。
- 日付: 2026-07-04
- 背景: 自己成長ループの「検証」段が何を満たせば前進可能かを機械的に定義する（`cycle/code-quality.yaml`）。
- 決定: あるタスクが **完了** とみなせるのは全て満たす時:
  1. **`node scripts/feature-gate.mjs` が緑**（OPA の検査、契約、レビュー上限）。
  2. ハーネスにテストがある変更は `pnpm test` が緑。
  3. **挙動変更タスクは TDD 赤の証跡**（`node --test` の失敗ログ）があること。
     例外は `cycle/code-quality.yaml` の `tdd_exceptions` を人間が明示した場合のみ（[[0013]]）。
  4. 秘密スキャン通過（`PUBLIC_`以外の鍵がクライアント/コミットに無い）。
  5. **品質の指摘は親が1回、直す・検討・記録・却下に分ける。** コードを変えるのは直すだけ。`tsc --noEmit` が緑なら止める。人が明示したレビューは Fable 1回まで。verifier と reflector は起動しない（[[0050]] [[0051]]）。
  6. **並列展開する場合は plan-confirm 承認証跡**が計画ファイルにあること（[[0033]]）。
  7. **内省は `docs/learnings.md` に追記する。** Feature 票は起票しない。機能の判断は `features/<slug>/design.md`。
  8. **必須 skill の used/skipped を `cycle/events.jsonl` に記録**（[[0039]]）。
  9. **commit は hook を必ず通し、主語は日本語 conventional**（[[0042]]）。`--no-verify` は不可。
- 結果: 「動いたつもり」で前進しない。
- 関連: [[0013-test-strategy]] [[0031]] [[0033]] [[0037]] [[0038]] [[0039]] [[0041]] [[0042]]
