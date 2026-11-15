/** 画面の差分は、親が操作したスクリーンショットか録画が無いと通れない。 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { listDiffPaths } from './packet-policy.mjs';

const SCREEN_ROOTS = ['app/', 'src/', 'public/'];
const SCREEN_EXT = /\.(?:tsx|jsx|vue|svelte|css|html)$/i;
const ARTIFACT_EXT = /\.(?:png|webp|jpe?g|gif|mp4|webm)$/i;
const COMMAND_PREFIXES = ['scripts/', 'policy/', 'contracts/', 'features/', 'src/', 'app/', '.github/workflows/'];
const COMMAND_FILES = new Set(['package.json', 'pnpm-lock.yaml']);

function normalizePath(p) {
	const raw = String(p ?? '');
	if (raw.includes('\\')) return '';
	if (!raw || raw.startsWith('/') || raw.split('/').some((part) => part === '' || part === '.' || part === '..')) {
		return '';
	}
	return raw;
}

export function isScreenPath(p) {
	const path = normalizePath(p);
	return Boolean(path) && SCREEN_ROOTS.some((root) => path.startsWith(root)) && SCREEN_EXT.test(path);
}

function isCommandPath(p) {
	const path = normalizePath(p);
	return Boolean(path) && (COMMAND_FILES.has(path) || COMMAND_PREFIXES.some((prefix) => path.startsWith(prefix)));
}

/** @returns {'screen' | 'command' | 'prose'} */
export function runtimeKind(paths) {
	const list = Array.isArray(paths) ? paths : [];
	if (list.some(isScreenPath)) return 'screen';
	if (list.some(isCommandPath)) return 'command';
	return 'prose';
}

export function artifactPathError(artifact) {
	const path = normalizePath(artifact);
	if (!path) return '成果物のパスがリポジトリ内の相対パスではない';
	if (!ARTIFACT_EXT.test(path)) return '成果物はスクリーンショットか録画ではない';
	return '';
}

function parseScreenRecords(text) {
	const records = [];
	const lines = String(text ?? '').split('\n');
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i].trim();
		if (!line) continue;
		let row;
		try {
			row = JSON.parse(line);
		} catch {
			throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行が JSON ではない`);
		}
		if (!row || typeof row !== 'object' || Array.isArray(row)) {
			throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行がオブジェクトではない`);
		}
		if (row.kind !== 'screen') {
			throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行の kind は screen だけ`);
		}
		if (!Array.isArray(row.paths) || row.paths.some((p) => !normalizePath(p))) {
			throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行の paths が相対パスの配列ではない`);
		}
		const artifactError = artifactPathError(row.artifact);
		if (artifactError) throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行: ${artifactError}`);
		const paths = row.paths.map((p) => normalizePath(p));
		if (!row.sha256 || typeof row.sha256 !== 'object' || Array.isArray(row.sha256)) {
			throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行に sha256 が無い`);
		}
		const sha256 = {};
		for (const p of paths) {
			const hex = row.sha256[p];
			if (typeof hex !== 'string' || !/^[a-f0-9]{64}$/.test(hex)) {
				throw new Error(`cycle/runtime-verify.jsonl の ${i + 1} 行に ${p} の sha256 が無い`);
			}
			sha256[p] = hex;
		}
		records.push({
			paths,
			artifact: normalizePath(row.artifact),
			sha256
		});
	}
	return records;
}

function inside(root, rel) {
	const abs = resolve(root, rel);
	const back = relative(resolve(root), abs);
	if (!back || back.startsWith('..') || back.startsWith('/')) return '';
	return abs;
}

/**
 * まだ作業ツリーにある画面ファイルのうち、実在する成果物の行が覆っていないもの。
 * 削除された画面ファイルは対象にしない。
 * @param {string[]} diffPaths
 * @param {string} text
 * @param {{ sourceExists: (p: string) => boolean, artifactExists: (p: string) => boolean, sourceHash?: (p: string) => string }} exists
 */
export function uncoveredScreenPaths(diffPaths, text, exists) {
	const records = parseScreenRecords(text);
	const needed = [...new Set((Array.isArray(diffPaths) ? diffPaths : []).map(normalizePath).filter(isScreenPath))]
		.filter((p) => exists.sourceExists(p))
		.sort();
	const covered = new Set();
	for (const rec of records) {
		if (!exists.artifactExists(rec.artifact)) continue;
		for (const p of rec.paths) {
			if (exists.sourceHash && exists.sourceHash(p) !== rec.sha256[p]) continue;
			covered.add(p);
		}
	}
	return needed.filter((p) => !covered.has(p));
}

/** diffPaths を省略すると、データ根の merge-base 差分を見る。 */
export function screenGap(root, diffPaths = listDiffPaths(root)) {
	const recordPath = join(root, 'cycle', 'runtime-verify.jsonl');
	let text = '';
	if (existsSync(recordPath)) {
		if (!lstatSync(recordPath).isFile()) throw new Error('cycle/runtime-verify.jsonl は通常ファイルだけ');
		text = readFileSync(recordPath, 'utf8');
	}
	return uncoveredScreenPaths(diffPaths, text, {
		sourceExists: (p) => {
			const abs = inside(root, p);
			if (!abs) return false;
			try {
				return statSync(abs).isFile();
			} catch {
				return false;
			}
		},
		artifactExists: (p) => {
			const abs = inside(root, p);
			if (!abs) return false;
			try {
				return lstatSync(abs).isFile();
			} catch {
				return false;
			}
		},
		sourceHash: (p) => {
			const abs = inside(root, p);
			if (!abs) return '';
			try {
				return createHash('sha256').update(readFileSync(abs)).digest('hex');
			} catch {
				return '';
			}
		}
	});
}
