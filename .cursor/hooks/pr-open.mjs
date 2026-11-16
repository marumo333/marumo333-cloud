#!/usr/bin/env node
/** Cursor beforeShellExecution: マーカーが無い push と gh pr create を拒否する。Task は起動しない。 */
import { readFileSync } from 'node:fs';
import { guardPrPublish, reviewGapAt } from '../../scripts/lib/pr-open.mjs';
import { parseHookInput } from '../../scripts/lib/hook-json.mjs';

let raw = '';
try {
	raw = readFileSync(0, 'utf8');
} catch {}

function deny(message) {
	process.stdout.write(JSON.stringify({ permission: 'deny', user_message: message, agent_message: message }));
	process.exit(0);
}

function allow() {
	process.stdout.write(JSON.stringify({ permission: 'allow' }));
	process.exit(0);
}

const parsed = parseHookInput(raw);
if (!parsed.ok) deny(`[pr-open] ${parsed.error}。拒否する。`);
const cmd = String(parsed.data.tool_input?.command ?? parsed.data.command ?? '');
const publish = guardPrPublish(cmd);
if (publish.action === 'allow') allow();
if (publish.action === 'deny') deny(publish.message);

let missing;
try {
	missing = reviewGapAt(process.cwd(), 'HEAD');
} catch (e) {
	deny(`[pr-open] マーカーを読めない: ${e.message || e}`);
}
if (missing.length) {
	deny(
		`[pr-open] マーカーが無い: ${missing.join(', ')}。cycle/pr-review.jsonl に code-review と security-review を書いてから PR を作る`
	);
}
allow();
