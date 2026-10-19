#!/usr/bin/env node
// PreToolUse(Bash): git commit 前に hook 回避禁止・日本語 conventional 主語・feature-gate。
import { readFileSync } from 'node:fs';
import { decideCommitGuard } from '../../scripts/lib/commit-guard.mjs';
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
const decision = decideCommitGuard(cmd);
if (decision.action === 'allow') process.exit(0);
if (decision.action === 'deny') {
	for (const e of decision.errors) console.error(e);
	process.exit(2);
}

const r = runPreCommit();
if (!r.ok) {
	console.error(r.message);
	process.exit(2);
}
process.exit(0);
