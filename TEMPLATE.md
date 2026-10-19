# テンプレートの使い方

このリポジトリは Cursor ハーネスのテンプレートです。対象は席・正本・ゲート・cycle（[[0039]]）。
ライセンスは MIT（[LICENSE](LICENSE)。著作表示は Copyright (c) 2026 marumo333）。

## 空リポへ載せる

```bash
git clone https://github.com/marumo333/marumo333-cloud.git
cd marumo333-cloud
corepack enable
# リモートを新しい空リポに向ける
git remote set-url origin https://github.com/<you>/<new-repo>.git
git push -u origin main
```

旧名 `cursor-harness` の remote も、このテンプレートとして扱う。

人間が GitHub で初期コミットを確認する。以降の改善は feature ブランチ → PR → マージ。

## このリポジトリを始める（clone のあと）

`pnpm install` を叩く。`prepare` が git hooks を入れる。クラウドも手元もプロバイダとモデルは聞かない。実行はホストの既定。commit 主語は `feat:` / `docs:` 等 + 日本語。`--no-verify` は拒否される（[[0042]]）。

機能ごとに ADR、レビュー、proposed、admitted は作らない。

## プロダクトを始める

この節はあらゆるプロダクトで使う。席・正本・ゲートはプロダクトへコピーしない。プロダクトでは ADR と Feature 票を作らない。

clone の次に、この順で叩く。

```bash
node scripts/init.mjs
node scripts/init.mjs --product
node scripts/init.mjs --product --apply
node scripts/start-feature.mjs <slug>
node scripts/check-behavior.mjs
```

`init` は依存と、無いときだけの `AGENTS.md`、`docs/GLOSSARY.md`、`ACTIONS.md` を置く。用語は `docs/GLOSSARY.md` だけに書く。ここに無い名前は作らない。プロダクトの remote では `--product` が消す予定を出すだけで、ファイルは残す。`--product --apply` が `cycle/` と決定以外の `docs/` を空の周に戻し、この用語集は無いときだけ作り、あるときは残す。テンプレートの remote では消さない。`start-feature` は `features/<slug>/` に振る舞いと作業と、失敗するテストだけを置く。`design.md` は `--design` のときだけ。`check-behavior` は、振る舞いが空でなく、テストが置き換えられているときだけ成功する。二度目は既存ファイルを上書きしない。

## 1周

1. 親はホストの既定。モデル ID は指定しない。検証と内省は親が行う。検証用の subagent は出さない。品質の機械ゲートは人が頼まなくても commit で走る。追加のモデル席は人が明示した1回だけ。
2. 機能は `node scripts/start-feature.mjs <slug>` の振る舞いとテストで進める。
3. 人間がマージすると次の cycle が開く。Feature 票は開かない。エージェントは自動起動しない。
