import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

test('strict は再起の入場に渡さない', () => {
	const src = readFileSync(join(ROOT, 'scripts/cycle-after-merge.mjs'), 'utf8');
	assert.match(src, /node_skip_rate: metrics\.node_skip_rate/);
	assert.doesNotMatch(src, /strict/);
});

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

test('同じマージの承認は二度書かない', () => {
	const dir = mkdtempSync(join(tmpdir(), 'cycle-receipt-'));
	mkdirSync(join(dir, 'cycle'), { recursive: true });
	writeFileSync(join(dir, 'cycle/required-cycle.json'), readFileSync(join(ROOT, 'cycle/required-cycle.json')));
	const kept = '{"type": "cycle_open", "cycle": "C-0001"}\n';
	writeFileSync(join(dir, 'cycle/events.jsonl'), kept);
	const opa = join(ROOT, '.tools', 'opa');
	if (existsSync(opa)) {
		mkdirSync(join(dir, '.tools'), { recursive: true });
		copyFileSync(opa, join(dir, '.tools', 'opa'));
		chmodSync(join(dir, '.tools', 'opa'), 0o755);
	}
	const bin = join(dir, 'bin');
	mkdirSync(bin);
	writeFileSync(join(bin, 'gh'), '#!/bin/sh\necho \'[]\'\n');
	chmodSync(join(bin, 'gh'), 0o755);
	const env = {
		HARNESS_ROOT: dir,
		OPA_POLICY_DIR: join(ROOT, 'policy'),
		PATH: `${bin}:${process.env.PATH}`,
		PR_HEAD_REF: 'cursor/example-be02',
		GITHUB_HEAD_REF: 'cursor/example-be02',
		MERGED: 'true',
		PR_NUMBER: '9',
		MERGE_SHA: 'abc1234'
	};
	const first = run(env);
	assert.equal(first.status, 0, first.stderr);
	const text = readFileSync(join(dir, 'cycle/events.jsonl'), 'utf8');
	assert.ok(text.startsWith(kept));
	assert.equal(text.split('\n').filter((line) => line.includes('"merge_sha":"abc1234"')).length, 1);
	assert.equal(text.split('\n').filter((line) => line.includes('cycle_open')).length, 2);
	const second = run(env);
	assert.equal(second.status, 0, second.stderr);
	assert.match(second.stderr, /このマージの承認は既にある/);
	assert.equal(readFileSync(join(dir, 'cycle/events.jsonl'), 'utf8'), text);
});
