import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendWork, readWorkLog, resumeLines, workGaps } from './lib/work-log.mjs';

const digest = 'a'.repeat(64);

test('ログが無いときと、決めていないときは続きが無い', () => {
	assert.deepEqual(workGaps('', digest), []);
	assert.deepEqual(resumeLines(''), ['[work-log] 続きは無い']);
});

test('要件または設計を決めたら残りを実装するまで開かない', () => {
	const decided = `${JSON.stringify({ kind: 'decided', what: '設計', left: ['実装', '自己レビュー'] })}\n`;
	assert.deepEqual(workGaps(decided, digest), ['残り: 実装, 自己レビュー', '自己レビューが無い']);
	assert.deepEqual(resumeLines(decided), ['[work-log] 続き: 実装, 自己レビュー']);
	const done = `${decided}${JSON.stringify({ kind: 'done', left: [] })}\n`;
	assert.deepEqual(workGaps(done, digest), ['自己レビューが無い']);
});

test('自己レビューは直すが 0 の行がこの木にあるときだけ開く', () => {
	const head = [
		{ kind: 'decided', what: '要件', left: ['実装'] },
		{ kind: 'done', left: [] },
		{ kind: 'self-review', sha256: digest, fix: 2, pass: 1, left: ['直す'] },
		{ kind: 'self-review', sha256: 'b'.repeat(64), fix: 0, pass: 1, left: [] }
	]
		.map((row) => JSON.stringify(row))
		.join('\n');
	assert.deepEqual(workGaps(`${head}\n`, digest), ['直すが 2']);
	const closed = `${head}\n${JSON.stringify({ kind: 'self-review', sha256: digest, fix: 0, pass: 2, left: [] })}\n`;
	assert.deepEqual(workGaps(closed, digest), []);
	assert.deepEqual(resumeLines(closed), ['[work-log] 続きは無い']);
	assert.throws(() => workGaps('{"kind":\n', digest), /JSON ではない/);
	assert.throws(
		() => appendWork(mkdtempSync(join(tmpdir(), 'work-')), { kind: 'self-review', sha256: digest, fix: 0, pass: 5, left: [] }),
		/上限/
	);
});

test('作業ログはディレクトリへ追記できる', () => {
	const dir = mkdtempSync(join(tmpdir(), 'work-'));
	appendWork(dir, { kind: 'decided', what: '設計', left: ['実装'] });
	assert.match(readWorkLog(dir), /設計/);
	assert.throws(() => appendWork(dir, { kind: 'note' }), /kind は/);
});
