import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const PACKET_MAX_BYTES = 32768;
const HANDOFF_KEYS = ['learnings', 'conversation', 'decisions', 'session'];
const HANDOFF_RE = new RegExp(
	`(?:^|[\\s{,\\[])["']?(${HANDOFF_KEYS.join('|')})["']?\\s*:\\s*([^\\n]*)`,
	'gi'
);
const DIARY_CHARS = 160;

export function isProcedurePath(rel) {
	const p = String(rel ?? '').replaceAll('\\', '/');
	if (p === 'AGENTS.md' || p === '.claude/AGENTS.md' || p === 'TEMPLATE.md') return true;
	return /^\.(?:claude|agents)\/skills\/.+\.md$/.test(p);
}

export function addedDiffText(diff) {
	const out = [];
	for (const line of String(diff ?? '').split('\n')) {
		if (line.startsWith('+++') || line.startsWith('---')) continue;
		if (line.startsWith('+')) out.push(line.slice(1));
	}
	return out.join('\n');
}

function emptyHandoff(value) {
	const trimmed = String(value ?? '').trim().replace(/,$/, '').trim();
	if (trimmed === '|' || trimmed === '>' || trimmed.startsWith('|') || trimmed.startsWith('>')) return false;
	let inner = trimmed;
	if (
		(inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) ||
		(inner.startsWith("'") && inner.endsWith("'") && inner.length >= 2)
	) {
		inner = inner.slice(1, -1);
	}
	return inner === '' || inner === 'null' || inner === '[]' || inner === '{}' || inner === '~';
}

function repeatsDiary(added, diary, minChars) {
	const a = String(added ?? '').replace(/\s+/g, ' ');
	const d = String(diary ?? '').replace(/\s+/g, ' ');
	if (a.length < minChars || d.length < minChars) return false;
	const gram = new Set();
	for (let i = 0; i + minChars <= d.length; i += 1) gram.add(d.slice(i, i + minChars));
	for (let i = 0; i + minChars <= a.length; i += 1) {
		if (gram.has(a.slice(i, i + minChars))) return true;
	}
	return false;
}

/** 手順へ残った私的な引き渡し。値の無いキー名と短い引用は対象にしない。 */
export function procedureLeak(added, diary, minChars = DIARY_CHARS) {
	const keys = new Set();
	HANDOFF_RE.lastIndex = 0;
	for (const match of String(added ?? '').matchAll(HANDOFF_RE)) {
		if (emptyHandoff(match[2])) continue;
		keys.add(match[1].toLowerCase());
	}
	return { keys: [...keys].sort(), diary: repeatsDiary(added, diary, minChars) };
}

export const FORBIDDEN_KEYS = new Set([
	'learnings',
	'conversation',
	'decisions',
	'session',
	'effort',
	'escalate',
	'seat'
]);
const CYCLE_RE = /^C-\d{4}$/;
const MODES = new Set(['isolated', 'packet']);

const ADR_RE = /^docs\/decisions\/[A-Za-z0-9._/-]+$/;
const ADR_ERROR = '--adr は docs/decisions 配下の相対パス';

export function assertAdrPaths(root, paths) {
	const rootReal = realpathSync(root);
	for (const p of paths ?? []) {
		const rel = String(p).replaceAll('\\', '/');
		if (rel.includes('..') || rel.startsWith('/') || !ADR_RE.test(rel)) {
			throw new Error(ADR_ERROR);
		}
		const abs = join(root, rel);
		if (!existsSync(abs)) throw new Error(`--adr が存在しない: ${rel}`);
		const st = lstatSync(abs);
		if (st.isSymbolicLink() || st.isDirectory()) {
			throw new Error('--adr は実在する通常ファイルだけ（symlink / ディレクトリは拒否）');
		}
		const real = realpathSync(abs);
		const fromRoot = relative(rootReal, real).replaceAll('\\', '/');
		if (fromRoot.startsWith('..') || fromRoot !== rel) {
			throw new Error('--adr は実在する通常ファイルだけ（symlink / ディレクトリは拒否）');
		}
	}
}

export function packetFileName({ cycle, node, seq }) {
	const safe = String(node ?? '').replace(/[:/]/g, '-');
	return `${cycle}.${safe}.${seq}.json`;
}

function assertCycle(cycle) {
	if (!CYCLE_RE.test(String(cycle ?? ''))) {
		throw new Error('--cycle は C-NNNN 形式');
	}
}

export function assertNoForbiddenKeys(value, path = '') {
	if (Array.isArray(value)) {
		value.forEach((v, i) => assertNoForbiddenKeys(v, `${path}[${i}]`));
		return;
	}
	if (value && typeof value === 'object') {
		for (const [k, v] of Object.entries(value)) {
			if (FORBIDDEN_KEYS.has(k)) {
				const kind = k === 'effort' || k === 'escalate' || k === 'seat' ? '子キー' : '禁則';
				throw new Error(`${kind}キー ${k} はパケットに置けない`);
			}
			assertNoForbiddenKeys(v, path ? `${path}.${k}` : k);
		}
	}
}

const INVISIBLE = /[\s\u00a0\u200b\u200c\u200d\u2060\ufeff\u3000]/g;

export function visibleText(value) {
	return String(value ?? '').replace(INVISIBLE, '');
}

export function hasFacts(packet) {
	if (visibleText(packet.feature)) return true;
	if (visibleText(packet.diff_stat)) return true;
	if (packet.metrics && typeof packet.metrics === 'object') {
		if (Object.values(packet.metrics).some((v) => v != null && visibleText(v))) return true;
	}
	if ((packet.catalog_hits ?? []).some((h) => visibleText(h?.id) && visibleText(h?.path))) {
		return true;
	}
	if ((packet.adr_paths ?? []).some((p) => visibleText(p))) return true;
	return false;
}

export function queryCatalogHits(catalog, query = {}) {
	let ents = [...(catalog?.entities ?? [])];
	if (query.feature) {
		const id = String(query.feature);
		ents = ents.filter((e) => e.id === id || String(e.path ?? '').includes(id));
	}
	if (query.paths?.length) {
		const set = new Set(query.paths);
		ents = ents.filter((e) => set.has(e.path));
	}
	return ents.slice(0, 20).map((e) => ({ id: e.id, path: e.path }));
}

export function buildPacket(input) {
	assertCycle(input.cycle);
	const node = String(input.node ?? '');
	if (!node) throw new Error('--node が必要');
	const seq = Number(input.seq);
	if (!Number.isInteger(seq) || seq < 1) throw new Error('--seq は 1 以上の整数');
	const context_mode = input.context_mode;
	if (!MODES.has(context_mode)) throw new Error('context_mode は isolated か packet');
	return {
		schema: 'harness-query/v1',
		cycle: input.cycle,
		node,
		seq,
		context_mode,
		feature: input.feature ?? null,
		diff_stat: String(input.diff_stat ?? '').slice(0, 2048),
		metrics: input.metrics ?? null,
		catalog_hits: (input.catalog_hits ?? []).slice(0, 20).map((h) => ({ id: h.id, path: h.path })),
		adr_paths: (input.adr_paths ?? []).slice(0, 12).map(String)
	};
}

export function encodePacket(packet, maxBytes = PACKET_MAX_BYTES) {
	assertNoForbiddenKeys(packet);
	if (packet.schema !== 'harness-query/v1') throw new Error('schema は harness-query/v1');
	assertCycle(packet.cycle);
	if (!hasFacts(packet)) throw new Error('空パケットは書かない');
	const raw = `${JSON.stringify(packet)}\n`;
	const bytes = Buffer.byteLength(raw);
	if (bytes > maxBytes) throw new Error(`パケットが上限 ${maxBytes} バイトを超えた`);
	return raw;
}

export function writePacket({ root, packet }) {
	const raw = encodePacket(packet);
	const rel = `cycle/packets/${packetFileName(packet)}`;
	const abs = join(root, rel);
	mkdirSync(dirname(abs), { recursive: true });
	try {
		writeFileSync(abs, raw, { flag: 'wx' });
	} catch (e) {
		if (e && e.code === 'EEXIST') throw new Error('既存パケットの上書きは拒否');
		throw e;
	}
	return {
		path: rel,
		bytes: Buffer.byteLength(raw),
		sha256: createHash('sha256').update(raw).digest('hex')
	};
}

export function nextDispatchSeq(events, cycle, node, proposed) {
	let max = 0;
	for (const ev of events ?? []) {
		if (ev.type === 'dispatch' && ev.cycle === cycle && ev.node === node) {
			const n = Number(ev.seq);
			if (Number.isInteger(n) && n > max) max = n;
		}
	}
	const next = max + 1;
	if (proposed != null) {
		const p = Number(proposed);
		if (p !== next) throw new Error(`seq は周内で単調増加（次は ${next}）`);
		return p;
	}
	return next;
}
