/** PR を開く前の code-review と security-review。hooks はマーカーを見るだけで、Task は起動しない。 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { extractCodeModeSteps, isCodeModeCommand } from './code-mode.mjs';
import { pipedShellPayloads, quotedPayloads, splitShellSegments } from './commit-guard.mjs';
import { expandSimpleAssignments } from './shell-assign.mjs';

export const MARKER_PATH = 'cycle/pr-review.jsonl';
export const EVENTS_LOG = 'cycle/events.jsonl';
export const REVIEW_KINDS = ['code-review', 'security-review'];

const GIT_TEXT_MAX = 8 * 1024 * 1024;

function gitText(root, args) {
	return execFileSync('git', args, {
		cwd: root,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'ignore'],
		maxBuffer: GIT_TEXT_MAX
	});
}

export function treeDigest(root, rev) {
	return digestFromEntries(parseTree(gitText(root, ['ls-tree', '-r', rev])));
}

export function commitParents(root, rev) {
	try {
		gitText(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
	} catch {
		return [];
	}
	const out = gitText(root, ['log', '-1', '--format=%P', rev]).trim();
	return out ? out.split(/\s+/) : [];
}

export function changedPaths(root, from, to) {
	let out = '';
	try {
		out = gitText(root, ['diff-tree', '--no-commit-id', '--name-only', '-r', from, to]);
	} catch (error) {
		const stdout = error && typeof error.stdout === 'string' ? error.stdout : '';
		if (error && error.status === 1 && stdout) out = stdout;
		else throw error;
	}
	return out.split('\n').filter(Boolean);
}

function showPath(root, rev, path) {
	try {
		return execFileSync('git', ['show', `${rev}:${path}`], {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: GIT_TEXT_MAX
		});
	} catch (error) {
		if (error && error.status === 128) return null;
		throw error;
	}
}

/** 旧い本文がそのまま先頭に残り、増分は改行で終わる行だけ。 */
export function isEventsAppend(root, from, to) {
	const before = showPath(root, from, EVENTS_LOG) ?? '';
	const after = showPath(root, to, EVENTS_LOG);
	if (after == null) return false;
	if (after.length <= before.length || !after.startsWith(before)) return false;
	if (before.length > 0 && !before.endsWith('\n')) return false;
	return after.endsWith('\n');
}

/**
 * 差分が cycle/events.jsonl への追記だけのとき、親の検査結果を継ぐ。
 * gapsAt は親の rev を受け、空配列ならその親は開いている。
 * @param {string} root
 * @param {string} rev
 * @param {(parent: string, seen: Set<string>) => string[]} gapsAt
 * @param {Set<string>} seen
 */
export function carriedFromEventsAppend(root, rev, gapsAt, seen) {
	for (const parent of commitParents(root, rev)) {
		if (seen.has(parent)) continue;
		const paths = changedPaths(root, parent, rev);
		if (paths.length !== 1 || paths[0] !== EVENTS_LOG) continue;
		if (!isEventsAppend(root, parent, rev)) continue;
		if (gapsAt(parent, seen).length === 0) return true;
	}
	return false;
}

export function digestFromEntries(entries) {
	const lines = [];
	for (const entry of entries) {
		if (!entry || entry.path === MARKER_PATH || entry.path === 'cycle/work-log.jsonl') continue;
		lines.push(`${entry.mode} ${entry.type} ${entry.sha} ${entry.path}`);
	}
	lines.sort();
	return createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex');
}

export function parseTree(text) {
	const entries = [];
	for (const line of String(text ?? '').split('\n')) {
		if (!line) continue;
		const tab = line.indexOf('\t');
		if (tab < 0) throw new Error('ls-tree の行が壊れている');
		const meta = line.slice(0, tab).split(' ');
		if (meta.length !== 3) throw new Error('ls-tree の行が壊れている');
		entries.push({ mode: meta[0], type: meta[1], sha: meta[2], path: line.slice(tab + 1) });
	}
	return entries;
}

function parseMarkers(text) {
	const found = new Map();
	const lines = String(text ?? '').split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (!line) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			throw new Error(`cycle/pr-review.jsonl の ${i + 1} 行が JSON ではない`);
		}
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			throw new Error(`cycle/pr-review.jsonl の ${i + 1} 行がオブジェクトではない`);
		}
		if (!REVIEW_KINDS.includes(row.kind)) {
			throw new Error('kind は code-review と security-review だけ');
		}
		if (found.has(row.kind)) throw new Error(`${row.kind} が2行ある`);
		if (typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(row.sha256)) {
			throw new Error(`cycle/pr-review.jsonl の ${i + 1} 行に sha256 が無い`);
		}
		found.set(row.kind, row.sha256);
	}
	return found;
}

export function missingReviewMarkers(text, digest) {
	const found = parseMarkers(text);
	return REVIEW_KINDS.filter((kind) => found.get(kind) !== digest);
}

export function pushedShas(stdin) {
	const shas = [];
	for (const line of String(stdin ?? '').split('\n')) {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 4) continue;
		const local = parts[1];
		if (!/^[0-9a-f]{40}$/i.test(local) || /^0+$/.test(local)) continue;
		shas.push(local);
	}
	return shas;
}

function tokensOf(segment) {
	const out = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let match;
	while ((match = re.exec(segment))) out.push(match[1] ?? match[2] ?? match[3]);
	return out;
}

function isNoVerify(token) {
	return /^--no-veri(?:f(?:y)?)?$/.test(token);
}

function classifyPublish(segment) {
	const text = segment.trim();
	if (/^gh\s+pr\s+create\b/.test(text)) return 'check';
	const tokens = tokensOf(text);
	let i = 0;
	while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
	if (tokens[i] === 'command') i += 1;
	if (tokens[i] !== 'git') return 'allow';
	i += 1;
	let foreign = false;
	let sub = '';
	const flags = [];
	while (i < tokens.length && !sub) {
		const token = tokens[i];
		if (token === '-C' || token === '--git-dir' || token === '--work-tree') {
			if (token === '-C') foreign = true;
			i += 2;
			continue;
		}
		if (token === '-c') {
			i += 2;
			continue;
		}
		if (token.startsWith('-')) {
			flags.push(token);
			i += 1;
			continue;
		}
		sub = token;
		i += 1;
	}
	if (sub !== 'push') return 'allow';
	while (i < tokens.length) {
		flags.push(tokens[i]);
		i += 1;
	}
	if (foreign || /hooksPath/i.test(text) || flags.some(isNoVerify)) return 'deny';
	return 'check';
}

function publishVerdict(command, depth) {
	const expanded = expandSimpleAssignments(command).text;
	let check = false;
	if (depth < 3) {
		const nested = [...quotedPayloads(expanded), ...pipedShellPayloads(expanded)];
		if (isCodeModeCommand(expanded)) nested.push(...extractCodeModeSteps(expanded));
		for (const piece of nested) {
			const inner = publishVerdict(piece, depth + 1);
			if (inner === 'deny') return 'deny';
			if (inner === 'check') check = true;
		}
	}
	for (const segment of splitShellSegments(expanded)) {
		const hit = classifyPublish(segment);
		if (hit === 'deny') return 'deny';
		if (hit === 'check') check = true;
	}
	return check ? 'check' : 'allow';
}

export function guardPrPublish(command) {
	const action = publishVerdict(String(command ?? ''), 0);
	if (action === 'deny') return { action, message: '[pr-open] push の hook 回避と別リポへの push は禁止。' };
	return { action, message: '' };
}

function markerText(root, rev) {
	try {
		return gitText(root, ['show', `${rev}:${MARKER_PATH}`]);
	} catch {
		return '';
	}
}

export function reviewGapAt(root, sha, seen = new Set()) {
	if (seen.has(sha)) return [...REVIEW_KINDS];
	seen.add(sha);
	const missing = missingReviewMarkers(markerText(root, sha), treeDigest(root, sha));
	if (missing.length === 0) return [];
	if (carriedFromEventsAppend(root, sha, (parent, seenNow) => reviewGapAt(root, parent, seenNow), seen)) return [];
	return missing;
}
