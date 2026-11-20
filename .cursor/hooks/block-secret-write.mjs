#!/usr/bin/env node
// 規約1 — PUBLIC_ 以外のシークレットをクライアント/ソースに出さない。実 .env の書き込みも防ぐ。
import { readFileSync } from 'node:fs';
import { parseHookInput } from '../../scripts/lib/hook-json.mjs';
import { secretWriteMessage } from '../../scripts/lib/secret-write.mjs';

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
const fp = String(ti.file_path || ti.path || '');
const content = String(ti.content ?? ti.new_string ?? '');
if (!fp) process.exit(0);
const message = secretWriteMessage(fp, content);
if (message) {
	console.error(message);
	process.exit(2);
}
process.exit(0);
