#!/usr/bin/env node
/** 振る舞いが空でなく、テストが置き換えられ、そのテストが成功するかを見る。 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BEHAVIOR_TEST_MARKER } from './start-feature.mjs';

const FAILURES = ['提出前に基準を満たさない', '書き戻しが失敗', '副作用だけが失敗'];

function filled(text) {
	const ears = /^WHEN[ \t]+\S/m.test(text) && /^THE SYSTEM SHALL[ \t]+\S/m.test(text);
	const gwt =
		/^Given[ \t]+\S/m.test(text) && /^When[ \t]+\S/m.test(text) && /^Then[ \t]+\S/m.test(text);
	return ears || gwt;
}

/**
 * @param {string} root
 */
export function runCheckBehavior(root) {
	const featuresDir = join(root, 'features');
	if (!existsSync(featuresDir)) {
		return { ok: true, lines: ['[check-behavior] 機能は無い'] };
	}
	const slugs = readdirSync(featuresDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(featuresDir, entry.name, 'requirements.md')))
		.map((entry) => entry.name)
		.sort();
	if (slugs.length === 0) {
		return { ok: true, lines: ['[check-behavior] 機能は無い'] };
	}
	/** @type {string[]} */
	const problems = [];
	const actionsPath = join(root, 'ACTIONS.md');
	if (!existsSync(actionsPath)) {
		problems.push('[check-behavior] ACTIONS.md が無い');
	} else {
		const actions = readFileSync(actionsPath, 'utf8');
		for (const phrase of FAILURES) {
			if (!actions.includes(phrase)) {
				problems.push(`[check-behavior] ACTIONS.md に「${phrase}」が無い`);
			}
		}
	}
	for (const slug of slugs) {
		const req = readFileSync(join(featuresDir, slug, 'requirements.md'), 'utf8');
		if (!filled(req)) problems.push(`[check-behavior] ${slug}: 振る舞いが空`);
		const testPath = join(featuresDir, slug, `${slug}.test.mjs`);
		if (!existsSync(testPath)) {
			problems.push(`[check-behavior] ${slug}: テストが無い`);
			continue;
		}
		if (readFileSync(testPath, 'utf8').includes(BEHAVIOR_TEST_MARKER)) {
			problems.push(`[check-behavior] ${slug}: テストが置き換えられていない`);
		}
	}
	if (problems.length) return { ok: false, lines: problems };
	for (const slug of slugs) {
		const failure = runFeatureTest(root, slug);
		if (failure) problems.push(failure);
	}
	if (problems.length) return { ok: false, lines: problems };
	return { ok: true, lines: [`[check-behavior] ${slugs.length} 機能のテストが成功`] };
}

/**
 * @param {string} root
 * @param {string} slug
 */
function runFeatureTest(root, slug) {
	const testPath = join(root, 'features', slug, `${slug}.test.mjs`);
	const env = { ...process.env };
	// 親が node --test のとき、子の --test は再入としてファイルを実行しない。
	delete env.NODE_TEST_CONTEXT;
	const res = spawnSync(process.execPath, ['--test', testPath], {
		cwd: root,
		encoding: 'utf8',
		env,
		timeout: 120000
	});
	if (res.status === 0 && !res.error) return '';
	const detail = `${res.stdout || ''}\n${res.stderr || ''}\n${res.error ? res.error.message : ''}`
		.trim()
		.split('\n')
		.slice(-12)
		.join('\n');
	return `[check-behavior] ${slug}: テストが失敗\n${detail}`;
}

function main() {
	const argv = process.argv.slice(2);
	let cwd = '';
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--cwd') cwd = argv[++i] ?? '';
	}
	if (argv.includes('--cwd') && !cwd) {
		console.error('[check-behavior] --cwd にはディレクトリが必要');
		process.exit(1);
	}
	const result = runCheckBehavior(resolve(cwd || process.cwd()));
	for (const line of result.lines) console.log(line);
	process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
