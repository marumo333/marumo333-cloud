import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventsAreAppend } from './lib/pr-open.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAND = join(ROOT, 'scripts/land-cycle-receipt.mjs');

function realGit() {
	return execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
}

function git(dir, args) {
	return execFileSync(realGit(), args, {
		cwd: dir,
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_AUTHOR_NAME: 'land-test',
			GIT_AUTHOR_EMAIL: 'land-test@example.com',
			GIT_COMMITTER_NAME: 'land-test',
			GIT_COMMITTER_EMAIL: 'land-test@example.com'
		}
	});
}

function harness(dir) {
	mkdirSync(join(dir, 'cycle'), { recursive: true });
	writeFileSync(join(dir, '.gitignore'), '.tools/\n');
	writeFileSync(join(dir, 'cycle/required-cycle.json'), readFileSync(join(ROOT, 'cycle/required-cycle.json')));
	writeFileSync(
		join(dir, 'cycle/events.jsonl'),
		'{"t":"2026-01-01T00:00:00.000Z","type":"cycle_open","cycle":"C-0001"}\n'
	);
	const opa = join(ROOT, '.tools', 'opa');
	if (existsSync(opa)) {
		mkdirSync(join(dir, '.tools'), { recursive: true });
		copyFileSync(opa, join(dir, '.tools', 'opa'));
		chmodSync(join(dir, '.tools', 'opa'), 0o755);
	}
	const bin = join(dir, 'bin');
	mkdirSync(bin);
	writeFileSync(join(bin, 'gh'), "#!/bin/sh\necho '[]'\n");
	chmodSync(join(bin, 'gh'), 0o755);
	return bin;
}

function repo() {
	const dir = mkdtempSync(join(tmpdir(), 'land-receipt-'));
	const bare = join(dir, 'bare.git');
	const work = join(dir, 'work');
	execFileSync(realGit(), ['init', '--bare', '-b', 'main', bare]);
	execFileSync(realGit(), ['init', '-b', 'main', work]);
	const bin = harness(work);
	git(work, ['add', '.gitignore', 'cycle/required-cycle.json', 'cycle/events.jsonl']);
	git(work, ['commit', '-m', 'chore: 試験の初期記録を置く。']);
	git(work, ['remote', 'add', 'origin', bare]);
	git(work, ['push', 'origin', 'HEAD:main']);
	return { dir, bare, work, bin };
}

function land(work, bin, env = {}) {
	return spawnSync(process.execPath, [LAND], {
		cwd: work,
		encoding: 'utf8',
		env: {
			...process.env,
			HARNESS_ROOT: work,
			OPA_POLICY_DIR: join(ROOT, 'policy'),
			PATH: `${bin}:${process.env.PATH}`,
			BASE_REF: 'main',
			PR_HEAD_REF: 'cursor/example-be02',
			GITHUB_HEAD_REF: 'cursor/example-be02',
			MERGED: 'true',
			PR_NUMBER: '9',
			MERGE_SHA: 'abc1234def',
			...env
		}
	});
}

function events(work) {
	return readFileSync(join(work, 'cycle/events.jsonl'), 'utf8');
}

test('追記の判定は先頭の保持と末尾の改行だけを見る', () => {
	assert.equal(eventsAreAppend('a\n', 'a\n{"type":"human_approved"}\n'), true);
	assert.equal(eventsAreAppend('', '{"type":"human_approved"}\n'), true);
	assert.equal(eventsAreAppend('a\n', 'b\n'), false);
	assert.equal(eventsAreAppend('a\n', 'a\n'), false);
	assert.equal(eventsAreAppend('a', 'a{"x":1}\n'), false);
	assert.equal(eventsAreAppend('a\n', 'a\n{"x":1}'), false);
});

test('承認の追記をマージ先へ1回だけ載せる', () => {
	const { work, bin } = repo();
	const first = land(work, bin);
	assert.equal(first.status, 0, first.stderr);
	const text = events(work);
	assert.equal(text.split('\n').filter((line) => line.includes('"merge_sha":"abc1234def"')).length, 1);
	assert.equal(git(work, ['rev-list', '--count', 'origin/main']).trim(), '2');
	assert.equal(git(work, ['diff', '--name-only', 'origin/main~1', 'origin/main']).trim(), 'cycle/events.jsonl');
	const second = land(work, bin);
	assert.equal(second.status, 0, second.stderr);
	assert.match(second.stderr, /イベントの変更なし/);
	assert.equal(events(work), text);
	assert.equal(git(work, ['rev-list', '--count', 'origin/main']).trim(), '2');
});

test('先に進んだマージ先の後ろへ追記する', () => {
	const { work, bin } = repo();
	assert.equal(land(work, bin).status, 0);
	const before = events(work);
	git(work, ['commit', '--allow-empty', '-m', 'chore: 別のマージを先に載せる。']);
	git(work, ['push', 'origin', 'HEAD:main']);
	const next = land(work, bin, { PR_NUMBER: '10', MERGE_SHA: 'bbbbbbb' });
	assert.equal(next.status, 0, next.stderr);
	const after = events(work);
	assert.ok(after.startsWith(before));
	assert.equal(after.split('\n').filter((line) => line.includes('"pr":"10"')).length, 1);
	assert.equal(git(work, ['rev-list', '--count', 'origin/main']).trim(), '4');
});

test('書き換えはマージ先へ載せない', () => {
	const { dir, work, bin } = repo();
	const child = join(dir, 'rewrite.mjs');
	writeFileSync(
		child,
		`import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
writeFileSync(join(process.env.HARNESS_ROOT, 'cycle/events.jsonl'), '{"type":"rewritten"}\\n');
`
	);
	const before = git(work, ['rev-parse', 'origin/main']).trim();
	const ran = land(work, bin, { HARNESS_LAND_TEST: '1', LAND_CHILD: child });
	assert.equal(ran.status, 1, ran.stderr);
	assert.match(ran.stderr, /追記以外は載せない/);
	assert.equal(git(work, ['rev-parse', 'origin/main']).trim(), before);
});

test('送り直しは最初の拒否のあと1件だけ載せる', () => {
	const { work, bin } = repo();
	const flag = join(work, 'push-failed');
	const wrapped = join(bin, 'git');
	writeFileSync(
		wrapped,
		`#!/bin/sh
if [ "$1" = push ] && [ ! -f ${JSON.stringify(flag)} ]; then
  touch ${JSON.stringify(flag)}
  echo 'non-fast-forward' >&2
  exit 1
fi
exec ${JSON.stringify(realGit())} "$@"
`
	);
	chmodSync(wrapped, 0o755);
	const ran = land(work, bin);
	assert.equal(ran.status, 0, ran.stderr);
	assert.match(ran.stderr, /送り直し 1/);
	assert.equal(events(work).split('\n').filter((line) => line.includes('"merge_sha":"abc1234def"')).length, 1);
	assert.equal(git(work, ['rev-list', '--count', 'origin/main']).trim(), '2');
});

test('BASE_REF が不正なら載せない', () => {
	const { work, bin } = repo();
	const ran = land(work, bin, { BASE_REF: 'main;touch /tmp/x' });
	assert.equal(ran.status, 1);
	assert.match(ran.stderr, /BASE_REF が不正/);
	assert.equal(git(work, ['rev-list', '--count', 'origin/main']).trim(), '1');
});
