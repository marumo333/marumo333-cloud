import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeMetrics, foldCycle } from './lib/cycle-metrics.mjs';
import {
	PACKET_MAX_BYTES,
	addedDiffText,
	assertAdrPaths,
	buildPacket,
	encodePacket,
	isProcedurePath,
	nextDispatchSeq,
	packetFileName,
	procedureLeak,
	queryCatalogHits,
	writePacket
} from './lib/harness-query.mjs';

function tmpRoot() {
	const root = mkdtempSync(join(tmpdir(), 'harness-query-'));
	mkdirSync(join(root, 'cycle', 'packets'), { recursive: true });
	return root;
}

test('ファイル名は C-NNNN.<node>.<seq>.json でコロンを置換する', () => {
	assert.equal(packetFileName({ cycle: 'C-0010', node: 'skill:verify', seq: 1 }), 'C-0010.skill-verify.1.json');
});

test('cycle が C-NNNN 以外なら組まない', () => {
	assert.throws(
		() =>
			buildPacket({
				cycle: 'cycle-1',
				node: 'skill:verify',
				seq: 1,
				context_mode: 'isolated',
				feature: 'F-0007',
				diff_stat: '1 file'
			}),
		/C-NNNN/
	);
});

test('禁則キー learnings / conversation / decisions / session を拒否する', () => {
	for (const key of ['learnings', 'conversation', 'decisions', 'session']) {
		assert.throws(
			() =>
				encodePacket({
					schema: 'harness-query/v1',
					cycle: 'C-0010',
					node: 'skill:verify',
					seq: 1,
					context_mode: 'isolated',
					feature: 'F-0007',
					diff_stat: 'ok',
					metrics: null,
					catalog_hits: [],
					adr_paths: [],
					[key]: 'no'
				}),
			/禁則/
		);
	}
});

test('入れ子の禁則キーも拒否する', () => {
	assert.throws(
		() =>
			encodePacket({
				schema: 'harness-query/v1',
				cycle: 'C-0010',
				node: 'skill:verify',
				seq: 1,
				context_mode: 'isolated',
				feature: 'F-0007',
				diff_stat: 'ok',
				metrics: { learnings: 'no' },
				catalog_hits: [],
				adr_paths: []
			}),
		/禁則/
	);
});

test('effort / escalate を packet に載せない', () => {
	assert.throws(
		() =>
			encodePacket({
				schema: 'harness-query/v1',
				cycle: 'C-0010',
				node: 'skill:verify',
				seq: 1,
				context_mode: 'isolated',
				feature: 'F-0007',
				diff_stat: 'ok',
				metrics: null,
				catalog_hits: [],
				adr_paths: [],
				effort: 'high'
			}),
		/子キー|effort/
	);
});

test('事実の無い空パケットは書かない', () => {
	assert.throws(
		() =>
			encodePacket(
				buildPacket({
					cycle: 'C-0010',
					node: 'skill:verify',
					seq: 1,
					context_mode: 'isolated'
				})
			),
		/空/
	);
});

test('上限超過は truncate せず失敗する', () => {
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:verify',
		seq: 1,
		context_mode: 'isolated',
		metrics: { pad: 'x'.repeat(PACKET_MAX_BYTES) }
	});
	assert.throws(() => encodePacket(packet), /上限/);
});

test('正当なパケットを書き sha256 を返す', () => {
	const root = tmpRoot();
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:verify',
		seq: 1,
		context_mode: 'isolated',
		feature: 'F-0007',
		diff_stat: '1 file changed',
		catalog_hits: [{ id: 'ADR-0045', path: 'docs/decisions/0045-dispatch-context-packet.md' }],
		adr_paths: ['docs/decisions/0045-dispatch-context-packet.md']
	});
	const written = writePacket({ root, packet });
	const rel = 'cycle/packets/C-0010.skill-verify.1.json';
	assert.equal(written.path, rel);
	assert.equal(existsSync(join(root, rel)), true);
	const raw = readFileSync(join(root, rel));
	assert.equal(written.bytes, raw.length);
	assert.ok(written.bytes <= PACKET_MAX_BYTES);
	assert.equal(written.sha256, createHash('sha256').update(raw).digest('hex'));
	const parsed = JSON.parse(raw.toString('utf8'));
	assert.equal(parsed.schema, 'harness-query/v1');
	assert.equal(parsed.feature, 'F-0007');
	assert.ok(!('learnings' in parsed));
	assert.ok(!('effort' in parsed));
});

test('catalog_hits は最大20件、adr_paths は最大12件', () => {
	const hits = queryCatalogHits(
		{
			entities: Array.from({ length: 30 }, (_, i) => ({
				id: `E-${i}`,
				path: `docs/decisions/${String(i).padStart(4, '0')}.md`
			}))
		},
		{}
	);
	assert.equal(hits.length, 20);
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:reflect',
		seq: 2,
		context_mode: 'packet',
		feature: 'F-0007',
		catalog_hits: hits,
		adr_paths: Array.from({ length: 20 }, (_, i) => `docs/decisions/${i}.md`)
	});
	assert.equal(packet.catalog_hits.length, 20);
	assert.equal(packet.adr_paths.length, 12);
});

test('dispatch seq は周内で単調増加する', () => {
	const events = [
		{ type: 'dispatch', cycle: 'C-0010', node: 'skill:verify', seq: 1 },
		{ type: 'dispatch', cycle: 'C-0010', node: 'skill:verify', seq: 2 },
		{ type: 'dispatch', cycle: 'C-0009', node: 'skill:verify', seq: 9 }
	];
	assert.equal(nextDispatchSeq(events, 'C-0010', 'skill:verify'), 3);
	assert.equal(nextDispatchSeq([], 'C-0010', 'skill:verify'), 1);
	assert.throws(() => nextDispatchSeq(events, 'C-0010', 'skill:verify', 2), /単調/);
});

test('既存 packet は上書きしない', () => {
	const root = tmpRoot();
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:verify',
		seq: 1,
		context_mode: 'isolated',
		feature: 'F-0007',
		diff_stat: 'first'
	});
	writePacket({ root, packet });
	assert.throws(
		() => writePacket({ root, packet: { ...packet, diff_stat: 'SECOND' } }),
		/上書き/
	);
});

test('--adr は docs/decisions だけ', () => {
	const root = tmpRoot();
	mkdirSync(join(root, 'docs', 'decisions'), { recursive: true });
	writeFileSync(join(root, 'docs', 'decisions', '0045-dispatch-context-packet.md'), 'x');
	assert.throws(() => assertAdrPaths(root, ['/etc/passwd']), /docs\/decisions/);
	assert.throws(() => assertAdrPaths(root, ['knowledge/decisions/0045-dispatch-context-packet.md']), /docs\/decisions/);
	assert.throws(() => assertAdrPaths(root, ['knowledge/learnings.md']), /docs\/decisions/);
	assertAdrPaths(root, ['docs/decisions/0045-dispatch-context-packet.md']);
	symlinkSync(
		join(root, 'docs', 'decisions', '0045-dispatch-context-packet.md'),
		join(root, 'docs', 'decisions', 'evil.md')
	);
	assert.throws(() => assertAdrPaths(root, ['docs/decisions/evil.md']), /symlink/);
});

test('手順は AGENTS と TEMPLATE と skill の md だけ', () => {
	assert.equal(isProcedurePath('AGENTS.md'), true);
	assert.equal(isProcedurePath('.claude/AGENTS.md'), true);
	assert.equal(isProcedurePath('TEMPLATE.md'), true);
	assert.equal(isProcedurePath('.claude/skills/cycle/SKILL.md'), true);
	assert.equal(isProcedurePath('.agents/skills/cycle/SKILL.md'), true);
	assert.equal(isProcedurePath('docs/learnings.md'), false);
	assert.equal(isProcedurePath('policy/packet.rego'), false);
	assert.equal(isProcedurePath('scripts/feature-gate.mjs'), false);
	assert.equal(isProcedurePath('.claude/skills/cycle/SKILL.txt'), false);
});

test('差分の追加行だけを手順の検査対象にする', () => {
	const diff = ['--- a/AGENTS.md', '+++ b/AGENTS.md', ' 残す', '+learnings: 日記', '-消す'].join('\n');
	assert.equal(addedDiffText(diff), 'learnings: 日記');
});

test('禁則キーに値が付くと手順から拒否し、空と散文は通す', () => {
	assert.deepEqual(procedureLeak('learnings: 日記本文', '').keys, ['learnings']);
	assert.deepEqual(procedureLeak('"conversation": "残す"', '').keys, ['conversation']);
	assert.deepEqual(procedureLeak("session: |\n  続く", '').keys, ['session']);
	assert.deepEqual(procedureLeak('decisions: ""', '').keys, []);
	assert.deepEqual(procedureLeak('learnings: null', '').keys, []);
	assert.deepEqual(procedureLeak('learnings:', '').keys, []);
	assert.deepEqual(procedureLeak('learnings は継がない。effort: high', '').keys, []);
});

test('日記の一続きを手順へ写すと拒否し、短い引用は通す', () => {
	const diary = `固有日記${'あ'.repeat(160)}`;
	assert.ok(diary.length >= 160);
	assert.equal(procedureLeak(diary, diary).diary, true);
	assert.equal(procedureLeak(diary.slice(0, 20), diary).diary, false);
	assert.equal(procedureLeak('手順はゲートを通す。'.repeat(8), diary).diary, false);
});
