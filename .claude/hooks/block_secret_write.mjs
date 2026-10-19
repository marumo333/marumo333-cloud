#!/usr/bin/env node
// PreToolUse(Write|Edit): 規約1 — PUBLIC_ 以外のシークレットをクライアント/ソースに出さない。
// 実 .env の書き込みも防ぐ。
import { readFileSync } from 'node:fs';
import { isBlockedEnvPath } from '../../scripts/lib/blocked-env.mjs';
import { parseHookInput } from '../../scripts/lib/hook-json.mjs';

let raw = '';
try {
	raw = readFileSync(0, 'utf8');
} catch {}
const parsed = parseHookInput(raw);
if (!parsed.ok) {
	console.error(`[block_secret_write] ${parsed.error}。拒否する。`);
	process.exit(2);
}
const data = parsed.data;

const ti = data.tool_input || {};
const fp = String(ti.file_path || ti.path || '').replace(/\\/g, '/');
const content = String(ti.content ?? ti.new_string ?? '');
if (!fp) process.exit(0);

if (isBlockedEnvPath(fp)) {
	console.error(
		'[block_secret_write] 規約1: 実 .env の書き込み/コミットは禁止（.env.example と .env.sample のみ可）。'
	);
	process.exit(2);
}

const patterns = [
	/sk-[A-Za-z0-9]{20,}/,
	/SUPABASE_SERVICE_ROLE_KEY\s*[:=]/,
	/STRIPE_SECRET_KEY\s*[:=]/,
	/STRIPE_WEBHOOK_SECRET\s*[:=]/,
	/OPENAI_API_KEY\s*[:=]\s*['"]?[A-Za-z0-9\-_]{10,}/,
	/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9\-_]{16,}['"]/i
];
const hit = patterns.find((p) => p.test(content));
if (hit) {
	console.error(
		'[block_secret_write] 規約1: シークレットらしき値を ' +
			fp +
			' に埋め込もうとしています。' +
			' PUBLIC_ 以外は server(`$env/static/private`)/Worker の秘密のみ。'
	);
	process.exit(2);
}
process.exit(0);
