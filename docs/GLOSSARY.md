# 名詞

ユビキタス言語はここだけに書く。ここに無い名前を、コードと文書で新しく作らない。用語を足すときはこの表に足す。

## 用語

| 用語 | 意味 |
| --- | --- |
| 席 | 役割の枠。親が常時。計画は重ならないスライスの前だけ。検証と内省は親が行う。モデル ID は書かない。 |
| 親 | ホストの既定で、壁打ちと、重なるファイルの実装と、契約とゲートの実行と、画面の差分の操作と、内省と、cycle の記録を行う。 |
| 正本 | 人が残す判断。置き場は `docs/decisions/` と `features/<slug>/`。 |
| ゲート | `node scripts/feature-gate.mjs`。commit 前に通す。 |
| cycle | 1周の記録。`cycle/events.jsonl` と `cycle/` の yaml。マージ後の追記は `cycle/` の PR で、その PR のマージでは次周を開かない。 |
| packet | 子に渡す JSON。会話と `docs/learnings.md` の全文は継がない。 |
| Feature 票 | 作らない。機能の作業は `features/<slug>/`。 |
| ホストの既定 | 実行するモデルはホストが決める。共有の yaml にはモデル ID を書かない。 |
| 初期化 | `node scripts/init.mjs`。`--product` は消す予定の一覧だけを出す。プロダクトの remote でファイルを空の周に戻すのは `--product --apply` だけ。このファイルは無いときだけ作り、あるときは残す。 |
| 蓄積 | `cycle/events.jsonl` と `docs/learnings.md` の日記。テンプレートの remote では残す。プロダクトでは `--apply` のときだけ空の周に戻す。 |
| プロダクトコード | `features/` と `src/` と `app/`。ゲートは差分がここを含むとき、振る舞いのテストと `tsc --noEmit` を見る。 |
| 画面検証 | `app/` `src/` `public/` の tsx、jsx、vue、svelte、css、html を、親が操作して残すスクリーンショットか録画。記録は `cycle/runtime-verify.jsonl` と、各画面ファイルの sha256。実在するファイルが無い、または中身が変わった古い行では、ゲートが失敗する。 |

## Object type

## Property

## Link type
