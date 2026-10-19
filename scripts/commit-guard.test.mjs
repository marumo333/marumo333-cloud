import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideCommitGuard } from './lib/commit-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('commit 以外は通す', () => {
	assert.equal(decideCommitGuard('git status').action, 'allow');
});

test('--no-verify は拒否', () => {
	const r = decideCommitGuard('git commit --no-verify -m "feat: ダメ。"');
	assert.equal(r.action, 'deny');
	assert.ok(r.errors.some((e) => e.includes('no-verify') || e.includes('hook')));
});

test('英語主語は拒否', () => {
	const r = decideCommitGuard('git commit -m "feat: add hook"');
	assert.equal(r.action, 'deny');
	assert.ok(r.errors.some((e) => e.includes('日本語')));
});

test('正しい -m は pre-commit を走らせる', () => {
	const r = decideCommitGuard('git commit -m "feat: フックを常時起動する。"');
	assert.equal(r.action, 'run-pre-commit');
});

test('メッセージ無しの commit も pre-commit を走らせる', () => {
	const r = decideCommitGuard('git commit --amend');
	assert.equal(r.action, 'run-pre-commit');
});

test('githooks は実行ビットが付いている', () => {
	for (const name of ['pre-commit', 'pre-merge-commit', 'commit-msg']) {
		const st = statSync(join(ROOT, 'scripts/githooks', name));
		assert.ok((st.mode & 0o111) !== 0, name);
	}
});

test('&& 連鎖の --no-verify は拒否', () => {
	const r = decideCommitGuard('git add -A && git commit --no-verify -m "feat: 抜け道。"');
	assert.equal(r.action, 'deny');
});

test('セミコロン連鎖の -n は拒否', () => {
	const r = decideCommitGuard('git status; git commit -n -m "feat: 抜け道。"');
	assert.equal(r.action, 'deny');
});

test('GIT_CONFIG 経由の hooksPath 無効化は拒否', () => {
	const r = decideCommitGuard(
		'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m "feat: 迂回。"'
	);
	assert.equal(r.action, 'deny');
});

test('git config core.hooksPath は拒否', () => {
	const r = decideCommitGuard('git config core.hooksPath /dev/null');
	assert.equal(r.action, 'deny');
});

test('chmod で githooks を落とすのは拒否', () => {
	const r = decideCommitGuard('chmod -x scripts/githooks/pre-commit');
	assert.equal(r.action, 'deny');
});

test('別リポへの -C commit は拒否', () => {
	const r = decideCommitGuard('git -C /tmp/other commit -m "feat: 越境。"');
	assert.equal(r.action, 'deny');
});

test('heredoc 本文に no-verify と書いてあっても主語が正しければ通す', () => {
	const cmd = `git commit -m "$(cat <<'EOF'
feat: pre-commit を常時起動する。

本文で回避フラグの名前に触れる。
EOF
)"`;
	const r = decideCommitGuard(cmd);
	assert.equal(r.action, 'run-pre-commit');
});

test('sh -c の中の -n は拒否', () => {
	const r = decideCommitGuard(`sh -c "git commit -n -m 'feat: 抜け道。'"`);
	assert.equal(r.action, 'deny');
});

test('eval の中の --no-verify は拒否', () => {
	const r = decideCommitGuard(`eval "git commit --no-verify -m 'feat: 抜け道。'"`);
	assert.equal(r.action, 'deny');
});

test('フラグ位置のコマンド置換は拒否', () => {
	const r = decideCommitGuard('git commit $(echo --no-verify) -m "feat: 抜け道。"');
	assert.equal(r.action, 'deny');
});

test('code-mode の step 内 --no-verify も拒否', () => {
	const r = decideCommitGuard(
		"node scripts/code-mode.mjs --step 'git commit --no-verify -m \"feat: ダメ。\"'"
	);
	assert.equal(r.action, 'deny');
});
