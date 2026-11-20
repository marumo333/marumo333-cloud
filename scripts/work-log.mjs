#!/usr/bin/env node
/** 作業ログの続きを出す。書き足しは decided / progress / self-review / done。 */
import { readWorkLog, resumeLines, appendWork, workGapAt } from './lib/work-log.mjs';
import { digestFromEntries, parseTree } from './lib/pr-open.mjs';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const cmd = process.argv[2] ?? 'resume';

if (cmd === 'resume') {
	for (const line of resumeLines(readWorkLog(root))) console.log(line);
	const gaps = workGapAt(root, 'HEAD');
	process.exit(gaps.length ? 1 : 0);
}

const leftFlag = process.argv.indexOf('--left');
const left = leftFlag >= 0 ? String(process.argv[leftFlag + 1] ?? '').split(',').filter(Boolean) : [];

if (cmd === 'decided') {
	const whatFlag = process.argv.indexOf('--what');
	const what = whatFlag >= 0 ? process.argv[whatFlag + 1] : '';
	appendWork(root, { kind: 'decided', what, left });
} else if (cmd === 'progress') {
	appendWork(root, { kind: 'progress', left });
} else if (cmd === 'done') {
	appendWork(root, { kind: 'done', left: [] });
} else if (cmd === 'self-review') {
	const fixFlag = process.argv.indexOf('--fix');
	const passFlag = process.argv.indexOf('--pass');
	const fix = fixFlag >= 0 ? Number(process.argv[fixFlag + 1]) : NaN;
	const pass = passFlag >= 0 ? Number(process.argv[passFlag + 1]) : NaN;
	const tree = execFileSync('git', ['ls-tree', '-r', 'HEAD'], { cwd: root, encoding: 'utf8' });
	appendWork(root, {
		kind: 'self-review',
		sha256: digestFromEntries(parseTree(tree)),
		fix,
		pass,
		left
	});
} else {
	console.error('[work-log] 使い方: resume | decided --what 要件|設計 --left 実装,自己レビュー | progress | self-review --fix N --pass N | done');
	process.exit(1);
}
console.log('[work-log] 書いた');
