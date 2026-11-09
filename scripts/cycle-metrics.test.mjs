import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeMetrics, foldCycle, foldTokenLedger, latestOpenCycle, nextCycleId } from './lib/cycle-metrics.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = JSON.parse(readFileSync(join(ROOT, 'cycle/required-cycle.json'), 'utf8'));

test('全部省略なら指標は落ちる。票は作らない', () => {
	const m = computeMetrics(required, {
		nodes: Object.fromEntries(required.nodes.map((n) => [n.id, 'skipped'])),
		edges: Object.fromEntries(required.edges.map((e) => [`${e.from}>${e.to}`, 'skipped']))
	});
	assert.equal(m.node_skip_rate, 1);
	assert.equal(m.edge_skip_rate, required.edges.length === 0 ? 0 : 1);
	assert.equal(m.state_integrity, 1);
	assert.equal(m.strict, 0);
	assert.equal(m.degraded, true);
});

test('全部使用なら緑', () => {
	const m = computeMetrics(required, {
		nodes: Object.fromEntries(required.nodes.map((n) => [n.id, 'used'])),
		edges: Object.fromEntries(required.edges.map((e) => [`${e.from}>${e.to}`, 'taken']))
	});
	assert.equal(m.node_skip_rate, 0);
	assert.equal(m.edge_skip_rate, 0);
	assert.equal(m.state_integrity, 1);
	assert.equal(m.has_failed, false);
	assert.equal(m.strict, 1);
	assert.equal(m.degraded, false);
});

test('全部失敗は緑ではない', () => {
	const m = computeMetrics(required, {
		nodes: Object.fromEntries(required.nodes.map((n) => [n.id, 'failed'])),
		edges: Object.fromEntries(required.edges.map((e) => [`${e.from}>${e.to}`, 'failed']))
	});
	assert.equal(m.has_failed, true);
	assert.equal(m.strict, 0);
	assert.equal(m.node_skip_rate, 0);
	assert.equal(m.degraded, true);
});

test('状態欠落は完全性を下げる', () => {
	const m = computeMetrics(required, { nodes: { 'skill:verify': 'used' }, edges: {} });
	assert.ok(m.state_integrity < 1);
	assert.equal(m.strict, 0);
	assert.equal(m.degraded, true);
});

test('foldCycle は jsonl を読む', () => {
	const folded = foldCycle(
		[
			{ cycle: 'C-0001', type: 'node_state', node: 'skill:verify', state: 'used' },
			{ cycle: 'C-0001', type: 'edge_state', from: 'skill:verify', to: 'skill:reflect', state: 'skipped' },
			{ cycle: 'C-0001', type: 'human_approved', merge_sha: 'abc' },
			{ cycle: 'C-0002', type: 'node_state', node: 'skill:verify', state: 'skipped' }
		],
		'C-0001'
	);
	assert.equal(folded.nodes['skill:verify'], 'used');
	assert.equal(folded.edges['skill:verify>skill:reflect'], 'skipped');
	assert.equal(folded.human_approved, true);
});

test('latestOpenCycle は承認済み id を飛ばす', () => {
	assert.equal(
		latestOpenCycle([
			{ type: 'cycle_open', cycle: 'C-0001' },
			{ type: 'human_approved', cycle: 'C-0001' },
			{ type: 'cycle_open', cycle: 'C-0002' }
		]),
		'C-0002'
	);
	assert.equal(nextCycleId('C-0002'), 'C-0003');
});

test('新しい cycle を開いたら古い未承認には戻らない', () => {
	assert.equal(
		latestOpenCycle([
			{ type: 'cycle_open', cycle: 'C-0004' },
			{ type: 'cycle_open', cycle: 'C-0005' },
			{ type: 'human_approved', cycle: 'C-0005' }
		]),
		'C-0005'
	);
});

test('token_ledger は畳み込みで観測項だけ出す', () => {
	const ledger = foldTokenLedger(
		[
			{
				cycle: 'C-0010',
				type: 'token_ledger',
				seat: 'grok',
				effort: 'medium',
				packet_bytes: 120,
				tasks: 2,
				zero_value_reinject: true
			},
			{
				cycle: 'C-0010',
				type: 'token_ledger',
				seat: 'fable',
				effort: 'high',
				packet_bytes: 80,
				tasks: 1,
				zero_value_reinject: false
			},
			{
				cycle: 'C-0009',
				type: 'token_ledger',
				seat: 'opus',
				effort: 'high',
				packet_bytes: 999,
				tasks: 9,
				zero_value_reinject: true
			}
		],
		'C-0010'
	);
	assert.equal(ledger.task_count, 3);
	assert.equal(ledger.packet_bytes_sum, 200);
	assert.equal(ledger.zero_value_reinject_count, 1);
	assert.deepEqual(ledger.seats, ['grok', 'fable']);
});

test('token_ledger は need_rerun 相当の3指標を変えない', () => {
	const events = [
		{ cycle: 'C-0010', type: 'node_state', node: 'skill:harness-api-budget', state: 'used' },
		{ cycle: 'C-0010', type: 'node_state', node: 'skill:adversarial-review', state: 'used' },
		{ cycle: 'C-0010', type: 'node_state', node: 'skill:verify', state: 'used' },
		{ cycle: 'C-0010', type: 'node_state', node: 'skill:reflect', state: 'used' },
		{ cycle: 'C-0010', type: 'edge_state', from: 'skill:adversarial-review', to: 'skill:verify', state: 'taken' },
		{ cycle: 'C-0010', type: 'edge_state', from: 'skill:verify', to: 'skill:reflect', state: 'taken' },
		{
			cycle: 'C-0010',
			type: 'token_ledger',
			seat: 'grok',
			effort: 'medium',
			packet_bytes: 10,
			tasks: 1,
			zero_value_reinject: true
		}
	];
	const m = computeMetrics(required, foldCycle(events, 'C-0010'));
	assert.equal(m.degraded, false);
	assert.equal(m.strict, 1);
	assert.equal(m.has_failed, false);
	assert.equal(m.node_skip_rate, 0);
});

test('辺が省略なら記録が揃っていても完了ではない', () => {
	const m = computeMetrics(
		{
			nodes: [{ id: 'skill:harness-api-budget' }],
			edges: [{ from: 'skill:harness-api-budget', to: 'skill:harness-api-budget' }]
		},
		{
			nodes: { 'skill:harness-api-budget': 'used' },
			edges: { 'skill:harness-api-budget>skill:harness-api-budget': 'skipped' }
		}
	);
	assert.equal(m.state_integrity, 1);
	assert.equal(m.strict, 0);
});
