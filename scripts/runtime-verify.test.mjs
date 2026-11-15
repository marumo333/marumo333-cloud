import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	artifactPathError,
	isScreenPath,
	runtimeKind,
	screenGap,
	uncoveredScreenPaths
} from './lib/runtime-verify.mjs';

const HEX = 'a'.repeat(64);
const exists = {
	sourceExists: (p) => p !== 'src/gone.tsx',
	artifactExists: (p) => p === 'cycle/screen.png' || p === 'cycle/screen.mp4',
	sourceHash: () => HEX
};

test('差分は画面、コマンド、散文に分かれる', () => {
	assert.equal(isScreenPath('app/page.tsx'), true);
	assert.equal(isScreenPath('src/App.vue'), true);
	assert.equal(isScreenPath('public/index.html'), true);
	assert.equal(isScreenPath('src/lib/parse.ts'), false);
	assert.equal(isScreenPath('docs/readme.css'), false);
	assert.equal(runtimeKind(['docs/learnings.md', 'AGENTS.md']), 'prose');
	assert.equal(runtimeKind(['scripts/feature-gate.mjs', 'README.md']), 'command');
	assert.equal(runtimeKind(['app/page.tsx', 'src/lib/parse.ts']), 'screen');
	assert.equal(runtimeKind([]), 'prose');
});

test('画面の差分は実在する成果物の行が覆ったときだけ空く', () => {
	const diff = ['app/page.tsx', 'src/App.CSS', 'src/gone.tsx', 'scripts/feature-gate.mjs'];
	assert.deepEqual(
		uncoveredScreenPaths(diff, '', exists),
		['app/page.tsx', 'src/App.CSS']
	);
	assert.deepEqual(uncoveredScreenPaths(['scripts/feature-gate.mjs', 'docs/learnings.md'], '', exists), []);
	const line = JSON.stringify({
		kind: 'screen',
		paths: ['app/page.tsx', 'src/App.CSS'],
		artifact: 'cycle/screen.png',
		sha256: { 'app/page.tsx': HEX, 'src/App.CSS': HEX }
	});
	assert.deepEqual(uncoveredScreenPaths(diff, line, exists), []);
	const stale = JSON.stringify({
		kind: 'screen',
		paths: ['app/page.tsx', 'src/App.CSS'],
		artifact: 'cycle/screen.png',
		sha256: { 'app/page.tsx': 'b'.repeat(64), 'src/App.CSS': HEX }
	});
	assert.deepEqual(uncoveredScreenPaths(diff, stale, exists), ['app/page.tsx']);
	assert.deepEqual(
		uncoveredScreenPaths(diff, line.replace('cycle/screen.png', 'cycle/missing.png'), exists),
		['app/page.tsx', 'src/App.CSS']
	);
});

test('成果物のパスはリポジトリ内の画像か動画だけ', () => {
	assert.equal(artifactPathError('cycle/screen.webp'), '');
	assert.equal(artifactPathError('cycle/walk.webm'), '');
	assert.notEqual(artifactPathError('../secret.png'), '');
	assert.notEqual(artifactPathError('/tmp/screen.png'), '');
	assert.notEqual(artifactPathError('app/page.tsx'), '');
	assert.notEqual(artifactPathError('cycle\\screen.png'), '');
	assert.throws(
		() => uncoveredScreenPaths(['app/page.tsx'], '{"kind":"note"}\n', exists),
		/kind は screen だけ/
	);
});

test('シンボリックリンクの成果物は画面を覆わない', () => {
	const root = mkdtempSync(join(tmpdir(), 'screen-'));
	mkdirSync(join(root, 'app'));
	mkdirSync(join(root, 'cycle'));
	const source = 'export {};\n';
	writeFileSync(join(root, 'app', 'page.tsx'), source);
	const sha256 = createHash('sha256').update(source).digest('hex');
	writeFileSync(join(root, 'cycle', 'real.png'), 'png');
	symlinkSync(join(root, 'cycle', 'real.png'), join(root, 'cycle', 'link.png'));
	writeFileSync(
		join(root, 'cycle', 'runtime-verify.jsonl'),
		`${JSON.stringify({ kind: 'screen', paths: ['app/page.tsx'], artifact: 'cycle/link.png', sha256: { 'app/page.tsx': sha256 } })}\n`
	);
	assert.deepEqual(screenGap(root, ['app/page.tsx']), ['app/page.tsx']);
	writeFileSync(
		join(root, 'cycle', 'runtime-verify.jsonl'),
		`${JSON.stringify({ kind: 'screen', paths: ['app/page.tsx'], artifact: 'cycle/real.png', sha256: { 'app/page.tsx': sha256 } })}\n`
	);
	assert.deepEqual(screenGap(root, ['app/page.tsx']), []);
});

test('feature-gate は画面の記録が無い差分を失敗にする', () => {
	const src = readFileSync(new URL('./feature-gate.mjs', import.meta.url), 'utf8');
	assert.match(src, /screenGap\(layout\.dataRoot\)/);
	assert.match(src, /画面の差分に操作の記録が無い/);
});
