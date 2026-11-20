import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
	digestFromEntries,
	guardPrPublish,
	missingReviewMarkers,
	parseTree,
	pushedShas
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

test('pre-push と CI と shell hook がマーカー検査を呼ぶ', () => {
	assert.match(readFileSync(new URL('./githooks/pre-push', import.meta.url), 'utf8'), /pr-open-check\.mjs" --push/);
	const workflow = readFileSync(new URL('../.github/workflows/feature-gate.yml', import.meta.url), 'utf8');
	assert.match(workflow, /pr-open-check\.mjs/);
	assert.match(workflow, /PR_HEAD/);
	assert.match(readFileSync(new URL('../.cursor/hooks/pr-open.mjs', import.meta.url), 'utf8'), /guardPrPublish/);
	assert.match(readFileSync(new URL('../.cursor/hooks.json', import.meta.url), 'utf8'), /pr-open\.mjs/);
});
