#!/usr/bin/env node
/** cycle/events.jsonl にグラフイベントを1件追記する */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEATS, assertDispatchPolicy, countCanonPaths } from './lib/packet-policy.mjs';

const ROOT = process.env.HARNESS_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS = join(ROOT, 'cycle', 'events.jsonl');
const REQUIRED = join(ROOT, 'cycle', 'required-cycle.json');
const CYCLE_RE = /^C-\d{4}$/;
const NODE_STATES = new Set(['used', 'skipped', 'failed', 'approved']);
const EDGE_STATES = new Set(['taken', 'skipped', 'failed']);

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i >= 0 ? process.argv[i + 1] : fallback;
}

const EFFORTS = new Set(['medium', 'high']);
const ESCALATES = new Set(['stay', 'trio', 'ceiling', 'human']);
const SHA_RE = /^[a-f0-9]{64}$/;

const type = arg('type');
const cycle = arg('cycle', 'C-0001');
if (!type) {
	console.error(
		'使い方: node scripts/cycle-record.mjs --type node_state|edge_state|cycle_open|dispatch|token_ledger [--cycle C-NNNN] ...'
	);
	process.exit(1);
}
if (type === 'human_approved') {
	console.error('human_approved は cycle-after-merge だけが書く');
	process.exit(1);
}
if (!CYCLE_RE.test(cycle)) {
	console.error('--cycle は C-NNNN 形式');
	process.exit(1);
}

const graph = existsSync(REQUIRED) ? JSON.parse(readFileSync(REQUIRED, 'utf8')) : { nodes: [], edges: [], optional_nodes: [] };
const knownNodes = new Set([
	...(graph.nodes ?? []).map((n) => n.id),
	...(graph.optional_nodes ?? []).map((n) => n.id)
]);
const knownEdges = new Set((graph.edges ?? []).map((e) => `${e.from}>${e.to}`));

const ev = { t: new Date().toISOString(), type, cycle };
if (type === 'node_state') {
	ev.node = arg('node');
	ev.state = arg('state');
	if (!ev.node || !NODE_STATES.has(ev.state)) {
		console.error('--node と --state（used|skipped|failed|approved）が必要');
		process.exit(1);
	}
	if (!knownNodes.has(ev.node)) {
		console.error(`未知のノード ${ev.node}`);
		process.exit(1);
	}
} else if (type === 'edge_state') {
	ev.from = arg('from');
	ev.to = arg('to');
	ev.state = arg('state');
	ev.reason = arg('reason', '');
	if (!ev.from || !ev.to || !EDGE_STATES.has(ev.state)) {
		console.error('--from --to --state（taken|skipped|failed）が必要');
		process.exit(1);
	}
	if (!knownEdges.has(`${ev.from}>${ev.to}`)) {
		console.error(`未知の辺 ${ev.from}>${ev.to}`);
		process.exit(1);
	}
} else if (type === 'cycle_open') {
	ev.source = arg('source', 'manual');
} else if (type === 'dispatch') {
	ev.node = arg('node');
	ev.seq = Number(arg('seq'));
	ev.seat = arg('seat');
	ev.escalate = arg('escalate');
	ev.sha256 = arg('sha256');
	const effort = arg('effort');
	if (effort) ev.effort = effort;
	if (!ev.node || !Number.isInteger(ev.seq) || ev.seq < 1) {
		console.error('--node と --seq（1以上）が必要');
		process.exit(1);
	}
	if (!knownNodes.has(ev.node)) {
		console.error(`未知のノード ${ev.node}`);
		process.exit(1);
	}
	if (!SEATS.has(ev.seat) || !ESCALATES.has(ev.escalate) || !SHA_RE.test(String(ev.sha256 ?? ''))) {
		console.error('--seat --escalate --sha256（64hex）が必要');
		process.exit(1);
	}
	if (ev.effort && !EFFORTS.has(ev.effort)) {
		console.error('--effort は medium|high');
		process.exit(1);
	}
	if (existsSync(EVENTS)) {
		const prev = readFileSync(EVENTS, 'utf8')
			.split('\n')
			.filter(Boolean)
			.map((l) => JSON.parse(l));
		let max = 0;
		for (const row of prev) {
			if (row.type === 'dispatch' && row.cycle === cycle && row.node === ev.node) {
				const n = Number(row.seq);
				if (Number.isInteger(n) && n > max) max = n;
			}
		}
		if (ev.seq !== max + 1) {
			console.error(`seq は周内で単調増加（次は ${max + 1}）`);
			process.exit(1);
		}
	} else if (ev.seq !== 1) {
		console.error('seq は周内で単調増加（次は 1）');
		process.exit(1);
	}
	if (process.argv.includes('--canon-path-count') || process.argv.includes('--child-keys')) {
		console.error('--canon-path-count / --child-keys は自己申告なので使えない。件数と席は導出する');
		process.exit(1);
	}
	let canon_path_count;
	try {
		canon_path_count = countCanonPaths(ROOT);
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
	try {
		assertDispatchPolicy({
			root: ROOT,
			dispatch: ev,
			canon_path_count,
			child_keys: []
		});
	} catch (e) {
		console.error(e.message);
		process.exit(1);
	}
} else if (type === 'token_ledger') {
	ev.seat = arg('seat');
	ev.effort = arg('effort');
	ev.packet_bytes = Number(arg('packet-bytes'));
	ev.tasks = Number(arg('tasks'));
	const zv = arg('zero-value-reinject');
	if (!SEATS.has(ev.seat) || !EFFORTS.has(ev.effort)) {
		console.error('--seat と --effort（medium|high）が必要');
		process.exit(1);
	}
	if (!Number.isFinite(ev.packet_bytes) || ev.packet_bytes < 0 || !Number.isInteger(ev.tasks) || ev.tasks < 0) {
		console.error('--packet-bytes と --tasks は 0 以上');
		process.exit(1);
	}
	if (zv !== 'true' && zv !== 'false') {
		console.error('--zero-value-reinject は true|false');
		process.exit(1);
	}
	ev.zero_value_reinject = zv === 'true';
} else {
	console.error(`未知の --type ${type}`);
	process.exit(1);
}

mkdirSync(dirname(EVENTS), { recursive: true });
appendFileSync(EVENTS, `${JSON.stringify(ev)}\n`);
console.error(`[cycle-record] ${type} ${cycle}`);
