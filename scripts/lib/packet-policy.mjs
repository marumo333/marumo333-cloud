import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assertAdrPaths, assertNoForbiddenKeys, hasFacts, packetFileName } from './harness-query.mjs';

const WORKSPACE = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const ROLE_BY_NODE = {
	'skill:harness-api-budget': 'parent',
	'skill:adversarial-review': 'review',
	'skill:verify': 'gate',
	'skill:reflect': 'gate',
	'skill:plan-confirm': 'gate',
	'skill:harness-grow': 'gate'
};

export const SEATS = new Set(['parent', 'implement', 'plan', 'review']);

const SEATS_BY_NODE = {
	'skill:harness-api-budget': ['parent'],
	'skill:adversarial-review': ['review'],
	'skill:verify': ['parent'],
	'skill:reflect': ['parent'],
	'skill:plan-confirm': ['plan'],
	'skill:harness-grow': ['plan']
};

const EFFORT_ALLOW = {
	parent: ['high', 'medium'],
	implement: ['high', 'medium'],
	gate: ['high'],
	review: ['high'],
	third: ['medium'],
	ceiling: ['high']
};

export function roleFor(node, _seat) {
	return ROLE_BY_NODE[node] ?? 'implement';
}

export function effortAllowFor(role) {
	return EFFORT_ALLOW[role] ?? ['high'];
}

export function loadRequiredCycle(root) {
	const abs = join(root, 'cycle', 'required-cycle.json');
	if (!existsSync(abs)) throw new Error('required-cycle.json が無い');
	return JSON.parse(readFileSync(abs, 'utf8'));
}

export function knownNodes(graph) {
	return new Set([...(graph.nodes ?? []).map((n) => n.id), ...(graph.optional_nodes ?? []).map((n) => n.id)]);
}

export function requiredModeFor(graph, node) {
	const all = [...(graph.nodes ?? []), ...(graph.optional_nodes ?? [])];
	const hit = all.find((n) => n.id === node);
	if (!hit) throw new Error(`未知のノード ${node}`);
	if (hit.context_mode !== 'isolated' && hit.context_mode !== 'packet') {
		throw new Error(`ノード ${node} の context_mode が不正`);
	}
	return hit.context_mode;
}

export function buildDispatchPolicyInput({
	packet,
	packet_bytes,
	packet_sha256,
	dispatch,
	required_mode,
	canon_path_count,
	child_keys = []
}) {
	const role = roleFor(dispatch.node, dispatch.seat);
	return {
		packet,
		packet_bytes,
		packet_sha256,
		dispatch: {
			cycle: dispatch.cycle,
			node: dispatch.node,
			seq: dispatch.seq,
			seat: dispatch.seat,
			escalate: dispatch.escalate,
			sha256: dispatch.sha256,
			context_mode: dispatch.context_mode ?? packet.context_mode,
			...(dispatch.effort ? { effort: dispatch.effort } : {})
		},
		writer: 'parent',
		child_keys,
		effort_allow: effortAllowFor(role),
		effort_default: effortAllowFor(role)[0],
		canon_path_count,
		required_mode,
		expected_seats: SEATS_BY_NODE[dispatch.node] ?? [],
		ceiling_replaces_gate:
			dispatch.escalate === 'ceiling' && (dispatch.node === 'skill:verify' || dispatch.node === 'skill:reflect')
	};
}

function opaBin() {
	const roots = [process.env.HARNESS_ROOT, WORKSPACE].filter(Boolean);
	for (const root of roots) {
		const pinned = join(root, '.tools', 'opa');
		if (existsSync(pinned)) return pinned;
	}
	throw new Error('OPA が .tools/opa に無い');
}

export function evalPacketDeny(input, policyDir = join(WORKSPACE, 'policy')) {
	const opa = opaBin();
	const dir = mkdtempSync(join(tmpdir(), 'packet-opa-'));
	const inputFile = join(dir, 'input.json');
	writeFileSync(inputFile, JSON.stringify(input));
	try {
		const out = execFileSync(opa, ['eval', '-f', 'json', '-d', policyDir, '--input', inputFile, 'data.packet.canon.deny'], {
			encoding: 'utf8'
		});
		const parsed = JSON.parse(out);
		const value = parsed.result?.[0]?.expressions?.[0]?.value;
		if (!Array.isArray(value)) throw new Error('packet.canon.deny が配列ではない');
		return value;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

export function assertDispatchPolicy({ root, policyDir, dispatch, canon_path_count, child_keys = [] }) {
	const graph = loadRequiredCycle(root);
	if (!knownNodes(graph).has(dispatch.node)) throw new Error(`未知のノード ${dispatch.node}`);
	const required_mode = requiredModeFor(graph, dispatch.node);
	const rel = `cycle/packets/${packetFileName(dispatch)}`;
	const abs = join(root, rel);
	if (!existsSync(abs)) throw new Error(`packet が無い: ${rel}`);
	const raw = readFileSync(abs);
	const packet_sha256 = createHash('sha256').update(raw).digest('hex');
	if (packet_sha256 !== dispatch.sha256) throw new Error('sha256 が packet と一致しない');
	const packet = JSON.parse(raw.toString('utf8'));
	assertNoForbiddenKeys(packet);
	assertAdrPaths(root, packet.adr_paths ?? []);
	if (!hasFacts(packet)) throw new Error('空パケットは書かない');
	if (!Number.isInteger(canon_path_count) || canon_path_count < 0) {
		throw new Error('canon_path_count は導出した 0 以上の整数');
	}
	const input = buildDispatchPolicyInput({
		packet,
		packet_bytes: raw.length,
		packet_sha256,
		dispatch: { ...dispatch, context_mode: packet.context_mode, cycle: dispatch.cycle ?? packet.cycle },
		required_mode,
		canon_path_count,
		child_keys
	});
	const deny = evalPacketDeny(input, policyDir);
	if (deny.length) throw new Error(`packet.canon deny: ${deny.join('; ')}`);
	return { input, deny, required_mode, packet };
}

function gitBin() {
	for (const p of ['/usr/bin/git', '/bin/git']) {
		if (existsSync(p)) return p;
	}
	throw new Error('git バイナリが /usr/bin に無い');
}

function gitEnv() {
	const env = { ...process.env };
	for (const k of Object.keys(env)) {
		if (k === 'PATH' || k.startsWith('GIT_')) delete env[k];
	}
	env.PATH = '/usr/bin:/bin';
	return env;
}

function gitLines(root, args) {
	return execFileSync(gitBin(), ['-c', 'core.quotePath=false', '-C', root, ...args], {
		encoding: 'utf8',
		cwd: root,
		env: gitEnv()
	})
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
}

function resolveMergeBase(root) {
	for (const base of ['origin/main', 'main']) {
		try {
			const mb = execFileSync(gitBin(), ['-c', 'core.quotePath=false', '-C', root, 'merge-base', base, 'HEAD'], {
				encoding: 'utf8',
				cwd: root,
				env: gitEnv()
			}).trim();
			if (mb) return mb;
		} catch {
			// 次の基準
		}
	}
	throw new Error('canon 件数を導出できない（merge-base 欠落）。欠落で stay を通さない');
}

export function listDiffPaths(root) {
	const mb = resolveMergeBase(root);
	return [
		...new Set([
			...gitLines(root, ['diff', '--cached', '--name-only']),
			...gitLines(root, ['diff', '--name-only']),
			...gitLines(root, ['ls-files', '--others', '--exclude-standard']),
			...gitLines(root, ['diff', '--name-only', mb])
		])
	];
}

export function countCanonPaths(root, policyDir = join(WORKSPACE, 'policy')) {
	const diff = listDiffPaths(root);
	if (!diff.length) return 0;
	const paths = evalHarnessQuery(diff, 'data.harness.canon.paths', policyDir);
	if (!Array.isArray(paths)) throw new Error('harness.canon.paths が配列ではない');
	return paths.length;
}

export function evalProductPaths(diff, policyDir = join(WORKSPACE, 'policy')) {
	if (!diff.length) return [];
	const paths = evalHarnessQuery(diff, 'data.harness.canon.product_paths', policyDir);
	if (!Array.isArray(paths)) throw new Error('harness.canon.product_paths が配列ではない');
	return paths;
}

function evalHarnessQuery(diff_paths, query, policyDir) {
	const opa = opaBin();
	const dir = mkdtempSync(join(tmpdir(), 'canon-opa-'));
	const inputFile = join(dir, 'input.json');
	writeFileSync(inputFile, JSON.stringify({ diff_paths }));
	try {
		const out = execFileSync(opa, ['eval', '-f', 'json', '-d', policyDir, '--input', inputFile, query], {
			encoding: 'utf8'
		});
		const parsed = JSON.parse(out);
		return parsed.result?.[0]?.expressions?.[0]?.value;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}
