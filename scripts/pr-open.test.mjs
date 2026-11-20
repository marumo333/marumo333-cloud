import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	digestFromEntries,
	guardPrPublish,
	missingReviewMarkers,
	parseTree,
	pushedShas,
	isEventsAppend,
	reviewGapAt
} from './lib/pr-open.mjs';

const entries = [
	{ mode: '100644', type: 'blob', sha: 'a'.repeat(40), path: 'AGENTS.md' },
	{ mode: '100644', type: 'blob', sha: 'b'.repeat(40), path: 'cycle/pr-review.jsonl' },
	{ mode: '100644', type: 'blob', sha: 'd'.repeat(40), path: 'cycle/work-log.jsonl' },
	{ mode: '120000', type: 'blob', sha: 'c'.repeat(40), path: '.agents/skills' }
];

function digest() {
	return digestFromEntries(entries);
}

function line(kind, sha = digest()) {
	return JSON.stringify({ kind, sha256: sha });
}

test('マーカーを除いたツリーのダイジェストは並びとマーカー行に依存しない', () => {
	const again = digestFromEntries([...entries].reverse());
	assert.equal(digest(), again);
	assert.equal(digest().length, 64);
	assert.equal(
		digest(),
		digestFromEntries(
			entries.filter((e) => e.path !== 'cycle/pr-review.jsonl' && e.path !== 'cycle/work-log.jsonl')
		)
	);
});

test('ls-tree の壊れた行は拒否する', () => {
	const text = `100644 blob ${'a'.repeat(40)}\tAGENTS.md\n`;
	assert.equal(parseTree(text)[0].path, 'AGENTS.md');
	assert.throws(() => parseTree('broken'), /ls-tree/);
});

test('code-review と security-review の両方が同じダイジェストのときだけ空く', () => {
	const sha = digest();
	assert.deepEqual(missingReviewMarkers('', sha), ['code-review', 'security-review']);
	assert.deepEqual(missingReviewMarkers(`${line('code-review')}\n`, sha), ['security-review']);
	assert.deepEqual(missingReviewMarkers(`${line('code-review')}\n${line('security-review')}\n`, sha), []);
	assert.deepEqual(
		missingReviewMarkers(`${line('code-review', 'd'.repeat(64))}\n${line('security-review')}\n`, sha),
		['code-review']
	);
	assert.throws(() => missingReviewMarkers('{"kind":"note"}\n', sha), /kind は code-review と security-review だけ/);
	assert.throws(
		() => missingReviewMarkers(`${line('code-review')}\n${line('code-review')}\n`, sha),
		/code-review が2行ある/
	);
});

test('push の --no-verify と、マーカー検査の対象コマンドを分ける', () => {
	assert.equal(guardPrPublish('git status').action, 'allow');
	assert.equal(guardPrPublish('git commit -m "feat: 直す。"').action, 'allow');
	assert.equal(guardPrPublish('git push --no-verify').action, 'deny');
	assert.equal(guardPrPublish('git push -u origin feature').action, 'check');
	assert.equal(guardPrPublish('gh pr create --title x').action, 'check');
	assert.equal(guardPrPublish('git push --no-verify && gh pr create').action, 'deny');
	assert.equal(guardPrPublish('gh pr create && git push --no-verify').action, 'deny');
	assert.equal(guardPrPublish('git --no-pager push --no-verify').action, 'deny');
	assert.equal(guardPrPublish('git -c core.hooksPath=/dev/null push').action, 'deny');
	assert.equal(guardPrPublish('command git push --no-verify').action, 'deny');
	assert.equal(guardPrPublish('FOO=1 git push --no-verify').action, 'deny');
	assert.equal(guardPrPublish('git push --no-veri').action, 'deny');
	assert.equal(guardPrPublish('git -C /tmp/other push').action, 'deny');
	assert.equal(
		guardPrPublish(`node scripts/code-mode.mjs --step 'git push --no-verify'`).action,
		'deny'
	);
	assert.deepEqual(pushedShas(`refs/heads/feature ${'a'.repeat(40)} refs/heads/feature ${'0'.repeat(40)}\n`), [
		'a'.repeat(40)
	]);
	assert.deepEqual(pushedShas(''), []);
});

test('cycle/events.jsonl だけの commit と merge はレビューマーカーを開かない', () => {
	const dir = mkdtempSync(join(tmpdir(), 'pr-events-'));
	const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
	git(['init', '-b', 'main']);
	git(['config', 'user.email', 't@example.com']);
	git(['config', 'user.name', 't']);
	writeFileSync(join(dir, 'a.txt'), 'a\n');
	git(['add', 'a.txt']);
	git(['commit', '-m', 'init']);
	const first = digestFromEntries(parseTree(execFileSync('git', ['ls-tree', '-r', 'HEAD'], { cwd: dir, encoding: 'utf8' })));
	mkdirSync(join(dir, 'cycle'));
	writeFileSync(
		join(dir, 'cycle/pr-review.jsonl'),
		['code-review', 'security-review'].map((kind) => JSON.stringify({ kind, sha256: first })).join('\n') + '\n'
	);
	git(['add', 'cycle/pr-review.jsonl']);
	git(['commit', '-m', 'markers']);
	assert.deepEqual(reviewGapAt(dir, 'HEAD'), []);
	writeFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"cycle_open"}\n');
	git(['add', 'cycle/events.jsonl']);
	git(['commit', '-m', 'events']);
	assert.deepEqual(reviewGapAt(dir, 'HEAD'), []);
	git(['checkout', '-b', 'journal']);
	appendFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"human_approved"}\n');
	git(['add', 'cycle/events.jsonl']);
	git(['commit', '-m', 'journal']);
	git(['checkout', 'main']);
	git(['merge', '--no-ff', '-m', 'merge', 'journal']);
	assert.deepEqual(reviewGapAt(dir, 'HEAD'), []);
	writeFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"rewritten"}\n');
	git(['add', 'cycle/events.jsonl']);
	git(['commit', '-m', 'rewrite']);
	assert.deepEqual(reviewGapAt(dir, 'HEAD'), ['code-review', 'security-review']);
	writeFileSync(join(dir, 'a.txt'), 'b\n');
	git(['add', 'a.txt']);
	git(['commit', '-m', 'code']);
	assert.deepEqual(reviewGapAt(dir, 'HEAD'), ['code-review', 'security-review']);
});

test('最終行の延長は cycle/events.jsonl の追記ではない', () => {
	const dir = mkdtempSync(join(tmpdir(), 'pr-extend-'));
	const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
	git(['init', '-b', 'main']);
	git(['config', 'user.email', 't@example.com']);
	git(['config', 'user.name', 't']);
	mkdirSync(join(dir, 'cycle'));
	writeFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"cycle_open"}\n');
	git(['add', 'cycle/events.jsonl']);
	git(['commit', '-m', 'events']);
	writeFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"cycle_open"}\n ');
	git(['add', 'cycle/events.jsonl']);
	const extended = execFileSync('git', ['write-tree'], { cwd: dir, encoding: 'utf8' }).trim();
	assert.equal(isEventsAppend(dir, 'HEAD', extended), false);
	writeFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"cycle_open"}\n{"type":"human_approved"}\n');
	git(['add', 'cycle/events.jsonl']);
	const appended = execFileSync('git', ['write-tree'], { cwd: dir, encoding: 'utf8' }).trim();
	assert.equal(isEventsAppend(dir, 'HEAD', appended), true);
});

test('1MB を超える events の差し替えは追記ではない', () => {
	const dir = mkdtempSync(join(tmpdir(), 'pr-big-'));
	const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
	git(['init', '-b', 'main']);
	git(['config', 'user.email', 't@example.com']);
	git(['config', 'user.name', 't']);
	mkdirSync(join(dir, 'cycle'));
	writeFileSync(join(dir, 'cycle/events.jsonl'), `${'a'.repeat(1024 * 1024)}\n`);
	git(['add', 'cycle/events.jsonl']);
	git(['commit', '-m', 'events']);
	writeFileSync(join(dir, 'cycle/events.jsonl'), '{"type":"rewritten"}\n');
	git(['add', 'cycle/events.jsonl']);
	const replaced = execFileSync('git', ['write-tree'], { cwd: dir, encoding: 'utf8' }).trim();
	assert.equal(isEventsAppend(dir, 'HEAD', replaced), false);
});

test('pre-push と CI と shell hook がマーカー検査を呼ぶ', () => {
	assert.match(readFileSync(new URL('./githooks/pre-push', import.meta.url), 'utf8'), /pr-open-check\.mjs" --push/);
	const workflow = readFileSync(new URL('../.github/workflows/feature-gate.yml', import.meta.url), 'utf8');
	assert.match(workflow, /pr-open-check\.mjs/);
	assert.match(workflow, /PR_HEAD/);
	assert.match(readFileSync(new URL('../.cursor/hooks/pr-open.mjs', import.meta.url), 'utf8'), /guardPrPublish/);
	assert.match(readFileSync(new URL('../.cursor/hooks.json', import.meta.url), 'utf8'), /pr-open\.mjs/);
});
