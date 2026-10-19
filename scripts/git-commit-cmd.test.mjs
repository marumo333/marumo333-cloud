import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGitCommitCommand } from './lib/git-commit-cmd.mjs';

test('commit 以外は isCommit=false', () => {
	const r = parseGitCommitCommand('git status');
	assert.equal(r.isCommit, false);
	assert.equal(r.skipsHooks, false);
});

test('-m の日本語メッセージを取る', () => {
	const r = parseGitCommitCommand('git commit -m "feat: フックを足す。"');
	assert.equal(r.isCommit, true);
	assert.equal(r.skipsHooks, false);
	assert.deepEqual(r.messages, ['feat: フックを足す。']);
});

test('--no-verify は hooks を飛ばす', () => {
	const r = parseGitCommitCommand('git commit --no-verify -m "feat: ダメ。"');
	assert.equal(r.isCommit, true);
	assert.equal(r.skipsHooks, true);
});

test('短い -n は --no-verify', () => {
	const r = parseGitCommitCommand('git commit -n -m "feat: ダメ。"');
	assert.equal(r.isCommit, true);
	assert.equal(r.skipsHooks, true);
});

test('-am は verify を飛ばさない', () => {
	const r = parseGitCommitCommand('git commit -am "feat: ステージ済みをまとめる。"');
	assert.equal(r.isCommit, true);
	assert.equal(r.skipsHooks, false);
	assert.deepEqual(r.messages, ['feat: ステージ済みをまとめる。']);
});

test('結合短いフラグ -an は --no-verify', () => {
	const r = parseGitCommitCommand('git commit -an -m "feat: ダメ。"');
	assert.equal(r.skipsHooks, true);
});

test('core.hooksPath=/dev/null は飛ばす', () => {
	const r = parseGitCommitCommand('git -c core.hooksPath=/dev/null commit -m "feat: ダメ。"');
	assert.equal(r.isCommit, true);
	assert.equal(r.skipsHooks, true);
});

test('heredoc の -m を取る', () => {
	const cmd = `git commit -m "$(cat <<'EOF'
feat: heredoc の主語である。
EOF
)"`;
	const r = parseGitCommitCommand(cmd);
	assert.equal(r.isCommit, true);
	assert.equal(r.skipsHooks, false);
	assert.equal(r.messages[0], 'feat: heredoc の主語である。');
});

test('複数 -m は連結する', () => {
	const r = parseGitCommitCommand('git commit -m "feat: 主語。" -m "本文。"');
	assert.equal(r.messages.join('\n\n'), 'feat: 主語。\n\n本文。');
});

test('--no-veri 略記は hooks を飛ばす', () => {
	const r = parseGitCommitCommand('git commit --no-veri -m "feat: 略記。"');
	assert.equal(r.skipsHooks, true);
});

test('hooksPath が scripts/githooks 以外なら飛ばす', () => {
	const r = parseGitCommitCommand('git -c core.hooksPath=/tmp/emptyhooks commit -m "feat: 空。"');
	assert.equal(r.skipsHooks, true);
});

test('-C で別ディレクトリなら foreignRepo', () => {
	const r = parseGitCommitCommand('git -C /tmp/other commit -m "feat: 越境。"');
	assert.equal(r.foreignRepo, true);
});

test('-F と --file の値は hook 回避にしない', () => {
	for (const cmd of [
		'git commit -F $(mktemp) -m "feat: ファイルから読む。"',
		'git commit -F$(mktemp) -m "feat: ファイルから読む。"',
		'git commit --file $(mktemp) -m "feat: ファイルから読む。"',
		'git commit --file=$(mktemp) -m "feat: ファイルから読む。"'
	]) {
		const r = parseGitCommitCommand(cmd);
		assert.equal(r.isCommit, true, cmd);
		assert.equal(r.skipsHooks, false, cmd);
		assert.deepEqual(r.messages, ['feat: ファイルから読む。']);
	}
});

test('フラグ位置のコマンド置換は hook を飛ばす', () => {
	const r = parseGitCommitCommand('git commit $(echo --no-verify) -m "feat: 抜け道。"');
	assert.equal(r.skipsHooks, true);
});
