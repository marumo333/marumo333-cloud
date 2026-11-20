/** 要件または設計のあと、残りと自己レビューを作業ログに残す。hooks はログを見るだけで Task は起動しない。 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { digestFromEntries, parseTree } from './pr-open.mjs';
import { SELF_REVIEW_CAP } from './review-disposition.mjs';

export const WORK_LOG = 'cycle/work-log.jsonl';
export const DECIDED_WHAT = ['要件', '設計'];

const SHA_RE = /^[a-f0-9]{64}$/;

/**
 * @param {string} text
 */
export function parseWorkLog(text) {
	/** @type {Record<string, unknown>[]} */
	const rows = [];
	const lines = String(text ?? '').split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (!line) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			throw new Error(`cycle/work-log.jsonl の ${i + 1} 行が JSON ではない`);
		}
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			throw new Error(`cycle/work-log.jsonl の ${i + 1} 行がオブジェクトではない`);
		}
		rows.push(row);
	}
	return rows;
}

function leftOf(row) {
	return Array.isArray(row.left) ? row.left.filter((item) => typeof item === 'string' && item) : [];
}

/**
 * @param {string} text
 * @param {string} digest
 */
export function workGaps(text, digest) {
	const rows = parseWorkLog(text);
	const decidedAt = rows.findLastIndex((row) => row.kind === 'decided');
	if (decidedAt < 0) return [];
	/** @type {string[]} */
	const gaps = [];
	const done = rows.slice(decidedAt + 1).some((row) => row.kind === 'done' && leftOf(row).length === 0);
	if (!done) {
		const left = leftOf(rows[rows.length - 1]);
		gaps.push(`残り: ${(left.length ? left : ['実装']).join(', ')}`);
	}
	const reviews = rows.filter((row) => row.kind === 'self-review' && row.sha256 === digest);
	const last = reviews[reviews.length - 1];
	if (!last) gaps.push('自己レビューが無い');
	else if (!Number.isInteger(last.pass) || last.pass < 1 || last.pass > SELF_REVIEW_CAP) gaps.push('自己レビューの上限を超えた');
	else if (last.pass > 1 && !reviews.slice(0, -1).some((row) => row.pass === last.pass - 1 && row.fix > 0)) {
		gaps.push('自己レビューの周が連続していない');
	} else if (last.fix !== 0) gaps.push(`直すが ${last.fix}`);
	return gaps;
}

/**
 * @param {string} text
 */
export function resumeLines(text) {
	const rows = parseWorkLog(text);
	if (!rows.length) return ['[work-log] 続きは無い'];
	/** @type {string[]} */
	const lines = [];
	const latest = rows[rows.length - 1];
	const left = leftOf(latest);
	const done = rows.some((row) => row.kind === 'done' && leftOf(row).length === 0);
	const closed = done && left.length === 0 && (latest.kind === 'done' || (latest.kind === 'self-review' && latest.fix === 0));
	if (!closed) lines.push(`[work-log] 続き: ${(left.length ? left : ['実装']).join(', ')}`);
	const review = rows.findLast((row) => row.kind === 'self-review');
	if (review && review.fix !== 0) lines.push(`[work-log] 直す: ${review.fix}`);
	return lines.length ? lines : ['[work-log] 続きは無い'];
}

/**
 * @param {Record<string, unknown>} entry
 */
export function assertWorkEntry(entry) {
	if (!entry || typeof entry !== 'object') throw new Error('作業ログの行がオブジェクトではない');
	if (entry.kind === 'decided') {
		if (!DECIDED_WHAT.includes(String(entry.what ?? ''))) throw new Error('what は要件か設計');
		if (leftOf(entry).length === 0) throw new Error('決めたあとの残りが空');
		return;
	}
	if (entry.kind === 'progress') return;
	if (entry.kind === 'done') {
		if (leftOf(entry).length !== 0) throw new Error('done の残りは空');
		return;
	}
	if (entry.kind === 'self-review') {
		if (!SHA_RE.test(String(entry.sha256 ?? ''))) throw new Error('自己レビューの sha256 が無い');
		if (!Number.isInteger(entry.fix) || entry.fix < 0) throw new Error('直す件数は 0 以上の整数');
		if (!Number.isInteger(entry.pass) || entry.pass < 1 || entry.pass > SELF_REVIEW_CAP) {
			throw new Error('自己レビューの上限を超えた');
		}
		return;
	}
	throw new Error('kind は decided、progress、self-review、done だけ');
}

/**
 * @param {string} root
 * @param {Record<string, unknown>} entry
 */
export function appendWork(root, entry) {
	assertWorkEntry(entry);
	const path = join(root, WORK_LOG);
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, `${JSON.stringify(entry)}\n`);
}

/**
 * @param {string} root
 * @param {string} sha
 */
function gitOut(root, args) {
	return execFileSync('git', args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore']
	});
}

export function workGapAt(root, sha) {
	let rev = sha;
	if (sha === 'HEAD' && gitOut(root, ['diff', '--cached', '--name-only']).trim()) {
		rev = gitOut(root, ['write-tree']).trim();
	}
	const tree = gitOut(root, ['ls-tree', '-r', rev]);
	let text = '';
	try {
		text = gitOut(root, ['show', `${rev}:${WORK_LOG}`]);
	} catch {
		text = '';
	}
	return workGaps(text, digestFromEntries(parseTree(tree)));
}

/**
 * @param {string} root
 */
export function readWorkLog(root) {
	try {
		return readFileSync(join(root, WORK_LOG), 'utf8');
	} catch {
		return '';
	}
}
