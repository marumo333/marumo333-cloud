#!/usr/bin/env node
// PreToolUse(Bash): git commit 前に hook 回避禁止・日本語 conventional 主語・feature-gate。
import { readFileSync } from 'node:fs';
import { decideCommitGuard } from '../../scripts/lib/commit-guard.mjs';
import { guardPrPublish, reviewGapAt } from '../../scripts/lib/pr-open.mjs';
import { parseHookInput } from '../../scripts/lib/hook-json.mjs';
import { runPreCommit } from '../../scripts/lib/run-pre-commit.mjs';

let raw = '';
try {
	raw = readFileSync(0, 'utf8');
} catch {}
const parsed = parseHookInput(raw);
if (!parsed.ok) {
	console.error(`[pre_commit_guard] ${parsed.error}。拒否する。`);
	process.exit(2);
}
const data = parsed.data;

const cmd = String(data.tool_input?.command ?? data.command ?? '');
const publish = guardPrPublish(cmd);
if (publish.action === 'deny') {
	console.error(publish.message);
	process.exit(2);
}
const decision = decideCommitGuard(cmd);
if (decision.action === 'deny') {
	for (const e of decision.errors) console.error(e);
	process.exit(2);
}
if (decision.action === 'run-pre-commit') {
	const r = runPreCommit();
	if (!r.ok) {
		console.error(r.message);
		process.exit(2);
	}
}
if (publish.action === 'check' && decision.action !== 'run-pre-commit') {
	let missing;
	try {
		missing = reviewGapAt(process.cwd(), 'HEAD');
	} catch (e) {
		console.error(`[pr-open] マーカーを読めない: ${e.message || e}`);
		process.exit(2);
	}
	if (missing.length) {
		console.error(
			`[pr-open] マーカーが無い: ${missing.join(', ')}。cycle/pr-review.jsonl に code-review と security-review を書いてから PR を作る`
		);
		process.exit(2);
	}
}
process.exit(0);
