#!/usr/bin/env node
/**
 * 作業 PR のマージ先へ、cycle/events.jsonl の追記だけを載せる。記録用 PR は開かない。
 * 書き換え、ほかのファイル、不正な送り先は拒否する。送りが競合したときは取り直す。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventsAreAppend } from './lib/pr-open.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.HARNESS_ROOT || join(HERE, '..');
const EVENTS = 'cycle/events.jsonl';
const ATTEMPTS = 3;

function git(args, allowFail = false) {
	try {
		return {
			ok: true,
			status: 0,
			stdout: execFileSync('git', args, {
				cwd: ROOT,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				maxBuffer: 8 * 1024 * 1024
			}),
			stderr: ''
		};
	} catch (error) {
		const stdout = error && typeof error.stdout === 'string' ? error.stdout : '';
		const stderr = error && typeof error.stderr === 'string' ? error.stderr : '';
		if (allowFail) return { ok: false, status: error?.status ?? 1, stdout, stderr };
		const wrapped = new Error(stderr || stdout || String(error));
		throw wrapped;
	}
}

function fail(message) {
	console.error(`[land-cycle-receipt] ${message}`);
	process.exit(1);
}

function baseRef() {
	const ref = String(process.env.BASE_REF || '');
	if (
		!/^[A-Za-z0-9._/-]+$/.test(ref) ||
		ref.includes('..') ||
		ref.startsWith('-') ||
		ref.startsWith('/') ||
		ref.endsWith('/')
	) {
		fail('BASE_REF が不正');
	}
	return ref;
}

function childScript() {
	const override = process.env.LAND_CHILD || '';
	if (process.env.HARNESS_LAND_TEST !== '1' || !override) return join(HERE, 'cycle-after-merge.mjs');
	const resolved = resolve(override);
	const root = resolve(tmpdir());
	if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) fail('LAND_CHILD は一時ディレクトリだけ');
	return resolved;
}

function changedPaths() {
	const out = git(['status', '--porcelain=v1', '--untracked-files=all']).stdout;
	/** @type {string[]} */
	const paths = [];
	for (const line of out.split('\n')) {
		if (!line) continue;
		const path = line.slice(3).trim();
		if (!path) continue;
		if (line.startsWith('??') && path !== EVENTS) continue;
		paths.push(path);
	}
	return paths;
}

function eventsAtHead() {
	const got = git(['show', `HEAD:${EVENTS}`], true);
	if (got.ok) return got.stdout;
	if (got.status === 128) return '';
	fail(got.stderr.trim() || 'events.jsonl を読めない');
}

function main() {
	const ref = baseRef();
	const mergeSha = String(process.env.MERGE_SHA || '').toLowerCase();
	if (!/^[0-9a-f]{7,40}$/.test(mergeSha)) fail('MERGE_SHA が不正');
	const pr = String(process.env.PR_NUMBER || '').replace(/[^\d]/g, '');
	git(['config', 'user.name', 'harness-cycle']);
	git(['config', 'user.email', 'harness-cycle@users.noreply.github.com']);
	for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
		const fetched = git(['fetch', 'origin', ref], true);
		if (!fetched.ok) fail(fetched.stderr.trim() || 'fetch に失敗した');
		const checked = git(['checkout', '-f', '--detach', `origin/${ref}`], true);
		if (!checked.ok) fail(checked.stderr.trim() || 'checkout に失敗した');
		const run = spawnSync(process.execPath, [childScript()], {
			cwd: ROOT,
			env: { ...process.env, HARNESS_ROOT: ROOT },
			encoding: 'utf8',
			maxBuffer: 8 * 1024 * 1024
		});
		if (run.stdout) process.stdout.write(run.stdout);
		if (run.stderr) process.stderr.write(run.stderr);
		if ((run.status ?? 1) !== 0) process.exit(run.status ?? 1);
		const paths = changedPaths();
		if (paths.length === 0) {
			console.error('[land-cycle-receipt] イベントの変更なし');
			process.exit(0);
		}
		if (paths.length !== 1 || paths[0] !== EVENTS) fail('events.jsonl 以外は載せない');
		const after = readFileSync(join(ROOT, EVENTS), 'utf8');
		if (!eventsAreAppend(eventsAtHead(), after)) fail('追記以外は載せない');
		git(['add', '--', EVENTS]);
		const committed = git(['commit', '-m', `chore: サイクル #${pr} の人間承認を記録する。`], true);
		if (!committed.ok) fail(committed.stderr.trim() || 'commit に失敗した');
		const pushed = git(['push', 'origin', `HEAD:${ref}`], true);
		if (pushed.ok) {
			console.error('[land-cycle-receipt] マージ先へ載せた');
			process.exit(0);
		}
		console.error(`[land-cycle-receipt] 送り直し ${attempt}`);
		if (pushed.stderr) process.stderr.write(pushed.stderr);
	}
	fail('マージ先へ載せられない');
}

main();
