# 名詞

ユビキタス言語はここだけに書く。ここに無い名前を、コードと文書で新しく作らない。用語を足すときはこの表に足す。

## 用語

| 用語 | 意味 |
| --- | --- |
| 席 | 役割の枠。親が常時。計画は重ならないスライスの前だけ。検証と内省は親が行う。モデルは grok-4.7-xhigh。 |
| 親 | grok-4.7-xhigh で、壁打ちと、重なるファイルの実装と、契約とゲートの実行と、画面の差分の操作と、内省と、cycle の記録を行う。 |
| 正本 | 人が残す判断。置き場は `docs/decisions/` と `features/<slug>/`。 |
| ゲート | `node scripts/feature-gate.mjs`。commit 前に通す。 |
| cycle | 1周の記録。`cycle/events.jsonl` と `cycle/` の yaml。作業 PR のマージが承認であり、その記録はマージ先へ直接載る。記録用の PR は開かない。枝が `cycle/` のマージでは承認も次周も書かない。 |
| packet | 子に渡す JSON。会話と `docs/learnings.md` の全文は継がない。 |
| Feature 票 | 作らない。機能の作業は `features/<slug>/`。 |
| ホストの既定 | 実行モデルは grok-4.7-xhigh。共有の yaml と agent の `model:` に書く。 |
| 初期化 | `node scripts/init.mjs`。`--product` は消す予定の一覧だけを出す。プロダクトの remote でファイルを空の周に戻すのは `--product --apply` だけ。検証環境の画面も未確認へ戻す。このファイルは無いときだけ作り、あるときは残す。 |
| 蓄積 | `cycle/events.jsonl` と `docs/learnings.md` の日記。テンプレートの remote では残す。プロダクトでは `--apply` のときだけ空の周に戻す。 |
| プロダクトコード | `features/` と `src/` と `app/`。ゲートは差分がここを含むとき、振る舞いのテストと `tsc --noEmit` を見る。 |
| 画面検証 | `app/` `src/` `public/` `verify-env/` の tsx、jsx、vue、svelte、css、html を、操作して残すスクリーンショットか録画。記録は `cycle/runtime-verify.jsonl` と、各画面ファイルの sha256。実在する画像か動画が無い、または中身が変わった古い行では、ゲートが失敗する。 |
| 検証環境 | Cursor のクラウドが `start` で `http://127.0.0.1:8765` に配る画面。置き場は `verify-env/`。 |
| Grok Bot | 検証環境の画面を1回操作する実行。親が Cursor のクラウドで起動する。モデルは grok-4.7-xhigh。code-review と security-reviewer ではない。 |
| レビューマーカー | PR を開く前の code-review と security-review の記録。ファイルは `cycle/pr-review.jsonl`。sha256 はマーカー自身を除いたツリー。`cycle/events.jsonl` の末尾への追記だけは、親の木のマーカーを継ぐ。書き換えは継がない。無い push と `gh pr create` は hook が拒否する。hooks は Task を起動しない。 |
| 作業ログ | `cycle/work-log.jsonl`。要件または設計を決めたあと、残りと自己レビューの直す件数を残す。次の実行は `node scripts/work-log.mjs resume` で続きを読む。残りがある push は拒否する。 |
| 自己レビュー | 親が直す件数を数える。直すが残るあいだ同じ直すだけを繰り返す。0 で止める。新しい指摘を探す周は開かない。上限は 4。sha256 は作業ログとレビューマーカーを除いた木。`cycle/events.jsonl` の末尾への追記だけは、親の木の自己レビューを継ぐ。書き換えは継がない。 |

## Object type

## Property

## Link type
