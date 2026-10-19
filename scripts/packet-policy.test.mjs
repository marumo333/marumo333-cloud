import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPacket, writePacket } from './lib/harness-query.mjs';
import {
	assertDispatchPolicy,
	buildDispatchPolicyInput,
	countCanonPaths,
	effortAllowFor,
	roleFor
} from './lib/packet-policy.mjs';

const WORKSPACE = join(dirname(fileURLToPath(import.meta.url)), '..');

function tmpRoot() {
	const root = mkdtempSync(join(tmpdir(), 'packet-policy-'));
	mkdirSync(join(root, 'cycle', 'packets'), { recursive: true });
	writeFileSync(
		join(root, 'cycle', 'required-cycle.json'),
		JSON.stringify({
			nodes: [
				{ id: 'skill:verify', kind: 'skill', context_mode: 'isolated' },
				{ id: 'skill:adversarial-review', kind: 'skill', context_mode: 'isolated' }
			],
			optional_nodes: []
		})
	);
	return root;
}

test('役割はノードで決まり、席の名前はモデルの族ではない', () => {
	assert.equal(roleFor('skill:verify', 'parent'), 'gate');
	assert.equal(roleFor('skill:adversarial-review', 'review'), 'review');
	assert.equal(roleFor('skill:plan-confirm', 'plan'), 'gate');
	assert.equal(roleFor('skill:harness-api-budget', 'parent'), 'parent');
});

test('sha256 不一致と欠落パケットは dispatch を拒否する', () => {
	const root = tmpRoot();
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:verify',
		seq: 1,
		context_mode: 'isolated',
		feature: 'F-0007',
		diff_stat: '1 file'
	});
	const written = writePacket({ root, packet });
	assert.throws(
		() =>
			assertDispatchPolicy({
				root,
				policyDir: join(WORKSPACE, 'policy'),
				dispatch: {
					cycle: 'C-0010',
					node: 'skill:verify',
					seq: 1,
					seat: 'parent',
					escalate: 'trio',
					sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
				},
				canon_path_count: 1
			}),
		/sha256/
	);
	assert.throws(
		() =>
			assertDispatchPolicy({
				root,
				policyDir: join(WORKSPACE, 'policy'),
				dispatch: {
					cycle: 'C-0010',
					node: 'skill:reflect',
					seq: 1,
					seat: 'parent',
					escalate: 'stay',
					sha256: written.sha256
				},
				canon_path_count: 0
			}),
		/packet|ノード/
	);
	assert.equal(written.bytes > 0, true);
});

test('親と実装の effort 既定は high で medium は許容に残る', () => {
	assert.deepEqual(effortAllowFor('parent'), ['high', 'medium']);
	assert.deepEqual(effortAllowFor('implement'), ['high', 'medium']);
	assert.equal(effortAllowFor('parent')[0], 'high');
	assert.equal(effortAllowFor('implement')[0], 'high');
});

test('モデル族の席と、canon 差分がある stay は deny', () => {
	const root = tmpRoot();
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:verify',
		seq: 1,
		context_mode: 'isolated',
		feature: 'F-0007',
		diff_stat: '1 file'
	});
	const written = writePacket({ root, packet });
	assert.throws(
		() =>
			assertDispatchPolicy({
				root,
				policyDir: join(WORKSPACE, 'policy'),
				dispatch: {
					cycle: 'C-0010',
					node: 'skill:verify',
					seq: 1,
					seat: 'grok',
					effort: 'medium',
					escalate: 'stay',
					sha256: written.sha256
				},
				canon_path_count: 1
			}),
		/deny|seat|stay|effort/
	);
});

test('導出 input は自己申告フラグを使わない', () => {
	const input = buildDispatchPolicyInput({
		packet: {
			schema: 'harness-query/v1',
			cycle: 'C-0010',
			node: 'skill:verify',
			seq: 1,
			context_mode: 'isolated'
		},
		packet_bytes: 10,
		packet_sha256: 'aa',
		dispatch: {
			cycle: 'C-0010',
			node: 'skill:verify',
			seq: 1,
			seat: 'parent',
			escalate: 'stay',
			sha256: 'aa',
			context_mode: 'isolated'
		},
		required_mode: 'isolated',
		canon_path_count: 2,
		child_keys: []
	});
	assert.equal(input.trio_third, undefined);
	assert.equal(input.role_swap_to_opus, undefined);
	assert.deepEqual(input.effort_allow, ['high']);
	assert.deepEqual(input.expected_seats, ['parent']);
});

test('GIT_DIR を空リポに向けても件数は対象 root から数える', () => {
	const repo = mkdtempSync(join(tmpdir(), 'canon-git-'));
	execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
	execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], {
		cwd: repo
	});
	mkdirSync(join(repo, 'scripts'), { recursive: true });
	writeFileSync(join(repo, 'scripts', 'x.mjs'), 'export {}\n');
	const clean = mkdtempSync(join(tmpdir(), 'empty-git-'));
	execFileSync('git', ['init'], { cwd: clean });
	const prevDir = process.env.GIT_DIR;
	const prevTree = process.env.GIT_WORK_TREE;
	const without = countCanonPaths(repo);
	process.env.GIT_DIR = join(clean, '.git');
	process.env.GIT_WORK_TREE = clean;
	try {
		const withEnv = countCanonPaths(repo);
		assert.equal(withEnv, without);
		assert.ok(without > 0);
	} finally {
		if (prevDir === undefined) delete process.env.GIT_DIR;
		else process.env.GIT_DIR = prevDir;
		if (prevTree === undefined) delete process.env.GIT_WORK_TREE;
		else process.env.GIT_WORK_TREE = prevTree;
	}
});

test('PATH の偽 git では件数を 0 にできない', () => {
	const repo = mkdtempSync(join(tmpdir(), 'canon-git-'));
	execFileSync('git', ['init', '-b', 'main'], { cwd: repo });
	execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init'], {
		cwd: repo
	});
	mkdirSync(join(repo, 'scripts'), { recursive: true });
	writeFileSync(join(repo, 'scripts', 'x.mjs'), 'export {}\n');
	const bin = mkdtempSync(join(tmpdir(), 'fake-git-'));
	writeFileSync(join(bin, 'git'), '#!/bin/sh\nexit 0\n');
	chmodSync(join(bin, 'git'), 0o755);
	const prev = process.env.PATH;
	process.env.PATH = `${bin}:${prev}`;
	try {
		assert.ok(countCanonPaths(repo) > 0);
	} finally {
		process.env.PATH = prev;
	}
});

test('git が無いルートでは canon 件数を 0 に落とさない', () => {
	const root = tmpRoot();
	assert.throws(() => countCanonPaths(root), /merge-base|導出できない/);
});

test('verify に grok 席は deny', () => {
	const root = tmpRoot();
	const packet = buildPacket({
		cycle: 'C-0010',
		node: 'skill:verify',
		seq: 1,
		context_mode: 'isolated',
		feature: 'F-0007',
		diff_stat: '1 file'
	});
	const written = writePacket({ root, packet });
	assert.throws(
		() =>
			assertDispatchPolicy({
				root,
				policyDir: join(WORKSPACE, 'policy'),
				dispatch: {
					cycle: 'C-0010',
					node: 'skill:verify',
					seq: 1,
					seat: 'grok',
					escalate: 'stay',
					sha256: written.sha256
				},
				canon_path_count: 0
			}),
		/席|deny|dispatch_seats/
	);
});
