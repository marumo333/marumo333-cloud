import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = join(ROOT, 'cycle/events.jsonl');

function run(env, args = []) {
	return spawnSync(process.execPath, [join(ROOT, 'scripts/cycle-after-merge.mjs'), ...args], {
		cwd: ROOT,
		env: { ...process.env, ...env },
		encoding: 'utf8'
	});
}

test('記録用の枝は承認も次周も書かない', () => {
	const before = readFileSync(EVENTS, 'utf8');
	const byHead = run({
		PR_HEAD_REF: 'cycle/journal-37-4059e3b',
		GITHUB_HEAD_REF: '',
		MERGED: 'true',
		PR_NUMBER: '38',
		MERGE_SHA: 'abc1234'
	});
	assert.equal(byHead.status, 0, byHead.stderr);
	assert.match(byHead.stderr, /承認も次周も書かない/);
	assert.doesNotMatch(byHead.stdout, /human_approved/);
	const byGithub = run({
		PR_HEAD_REF: '',
		GITHUB_HEAD_REF: 'cycle/journal-37-4059e3b',
		MERGED: 'true',
		MERGE_SHA: 'abc1234'
	});
	assert.equal(byGithub.status, 0, byGithub.stderr);
	assert.match(byGithub.stderr, /承認も次周も書かない/);
	assert.equal(readFileSync(EVENTS, 'utf8'), before);
});

test('作業の枝は dry-run で判定まで進む', () => {
	const before = readFileSync(EVENTS, 'utf8');
	const r = run(
		{
			PR_HEAD_REF: 'cursor/stop-journal-loop-c6e1',
			GITHUB_HEAD_REF: 'cursor/stop-journal-loop-c6e1',
			MERGED: 'true',
			PR_NUMBER: '1',
			MERGE_SHA: 'abc1234'
		},
		['--dry-run']
	);
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /"recurse"/);
	assert.equal(readFileSync(EVENTS, 'utf8'), before);
});
