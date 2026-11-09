/** ハーネス cycle の3指標（ADR 0039）。副作用なし。 */

const TERMINAL = new Set(['used', 'skipped', 'failed', 'approved']);

/**
 * @param {{ nodes: {id:string}[], edges: {from:string,to:string}[] }} required
 * @param {{ nodes?: Record<string,string>, edges?: Record<string,string>, human_approved?: boolean }} cycle
 */
export function computeMetrics(required, cycle) {
	const nodeStates = cycle.nodes ?? {};
	const edgeStates = cycle.edges ?? {};
	const nodes = required.nodes ?? [];
	const edges = required.edges ?? [];

	let nodeSkipped = 0;
	let nodeFailed = 0;
	let nodeTerminal = 0;
	for (const n of nodes) {
		const st = nodeStates[n.id];
		if (st === 'skipped') nodeSkipped += 1;
		if (st === 'failed') nodeFailed += 1;
		if (TERMINAL.has(st)) nodeTerminal += 1;
	}

	let edgeSkipped = 0;
	let edgeFailed = 0;
	for (const e of edges) {
		const key = `${e.from}>${e.to}`;
		if (edgeStates[key] === 'skipped') edgeSkipped += 1;
		if (edgeStates[key] === 'failed') edgeFailed += 1;
	}

	const node_skip_rate = nodes.length === 0 ? 0 : nodeSkipped / nodes.length;
	const edge_skip_rate = edges.length === 0 ? 0 : edgeSkipped / edges.length;
	const state_integrity = nodes.length === 0 ? 1 : nodeTerminal / nodes.length;
	const has_failed = nodeFailed > 0 || edgeFailed > 0;
	let strictNodes = 0;
	for (const n of nodes) {
		const st = nodeStates[n.id];
		if (st === 'used' || st === 'approved') strictNodes += 1;
	}
	let strictEdges = 0;
	for (const e of edges) {
		const st = edgeStates[`${e.from}>${e.to}`];
		if (st === 'taken' || st === 'approved') strictEdges += 1;
	}
	const strict = strictNodes === nodes.length && strictEdges === edges.length && !has_failed ? 1 : 0;

	return {
		node_skip_rate,
		edge_skip_rate,
		state_integrity,
		has_failed,
		strict,
		human_approved: cycle.human_approved === true,
		degraded: node_skip_rate > 0 || edge_skip_rate > 0 || has_failed || state_integrity < 1
	};
}

/**
 * events.jsonl を1サイクル分のスナップショットに畳む。
 * @param {object[]} events
 * @param {string} cycleId
 */
export function foldCycle(events, cycleId) {
	/** @type {{ nodes: Record<string,string>, edges: Record<string,string>, human_approved: boolean }} */
	const cycle = { nodes: {}, edges: {}, human_approved: false };
	for (const ev of events) {
		if (ev.cycle !== cycleId) continue;
		if (ev.type === 'node_state' && ev.node && ev.state) cycle.nodes[ev.node] = ev.state;
		if (ev.type === 'edge_state' && ev.from && ev.to && ev.state) {
			cycle.edges[`${ev.from}>${ev.to}`] = ev.state;
		}
		if (ev.type === 'human_approved') cycle.human_approved = true;
	}
	return cycle;
}

/** 最後に開いた cycle。新しい cycle_open のあと、古い未承認へ戻らない。 */
export function latestOpenCycle(events, fallback = 'C-0001') {
	let latest = fallback;
	for (const ev of events) {
		if (ev.type === 'cycle_open' && ev.cycle) latest = ev.cycle;
	}
	return latest;
}

export function nextCycleId(id) {
	const m = String(id).match(/(\d+)/);
	const n = m ? Number(m[1]) + 1 : 1;
	return `C-${String(n).padStart(4, '0')}`;
}

/**
 * token_ledger の観測項。need_rerun / 3指標には入れない。
 * @param {object[]} events
 * @param {string} cycleId
 */
export function foldTokenLedger(events, cycleId) {
	const seats = [];
	let task_count = 0;
	let packet_bytes_sum = 0;
	let zero_value_reinject_count = 0;
	for (const ev of events ?? []) {
		if (ev.cycle !== cycleId || ev.type !== 'token_ledger') continue;
		task_count += Number(ev.tasks) || 0;
		packet_bytes_sum += Number(ev.packet_bytes) || 0;
		if (ev.zero_value_reinject === true) zero_value_reinject_count += 1;
		if (ev.seat && !seats.includes(ev.seat)) seats.push(ev.seat);
	}
	return { task_count, packet_bytes_sum, zero_value_reinject_count, seats };
}
