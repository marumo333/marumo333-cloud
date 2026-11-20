#!/usr/bin/env node
/**
 * .env 読み取りブロック（規約1）。
 * 止められるのは、ファイルを直接開く読みと、cat / head / tail / less / more / source / printenv。
 * grep、awk、python の open、cp は止まらない。確実な境界は、秘密をリポジトリに置かないこと。
 * 壊れた JSON は拒否する。
 */
import { readFileSync } from 'node:fs';
import { parseHookInput } from '../../scripts/lib/hook-json.mjs';
import {
	commandDropsSearchLines,
	commandTouchesDependency,
	isBlockedDependencyPath
} from '../../scripts/lib/read-guard.mjs';

let raw = '';
try {
	raw = readFileSync(0, 'utf8');
} catch {}
const parsed = parseHookInput(raw);
if (!parsed.ok) {
	const msg = `[block_env_read] ${parsed.error}。拒否する。`;
	process.stdout.write(JSON.stringify({ permission: 'deny', user_message: msg, agent_message: msg }));
	console.error(msg);
	process.exit(2);
}
const data = parsed.data;

const cmd = String(data.tool_input?.command ?? data.command ?? '');
const filePath = String(
	data.tool_input?.file_path ?? data.tool_input?.path ?? data.filePath ?? data.path ?? ''
).replace(/\\/g, '/');

const SHELL_ENV_READ =
	/(?:^|[;&|\n]\s*|&&\s*|\|\|\s*)(?:sudo\s+)?(?:cat|less|more|head|tail|bat|nl|od|hexdump|xxd)\b[^;&|\n]*\.env\b|(?:^|[;&|\n]\s*)(?:source|\.)\s+[^\s]*\.env\b|(?:^|[;&|\n]\s*)printenv\b/;

const isEnvFile = /(^|\/)\.env(\.[^/]+)?$/.test(filePath) && !/\.env\.example$/.test(filePath);
const isShellHit = cmd.length > 0 && SHELL_ENV_READ.test(cmd);

function deny(message) {
	process.stdout.write(JSON.stringify({ permission: 'deny', user_message: message, agent_message: message }));
	process.exit(0);
}

function allow() {
	process.stdout.write(JSON.stringify({ permission: 'allow' }));
	process.exit(0);
}

if (isBlockedDependencyPath(filePath) || commandTouchesDependency(cmd)) {
	deny('[block_env_read] node_modules と .tools は読まない。');
}

if (commandDropsSearchLines(cmd)) {
	deny('[block_env_read] 検索は一致行を残す。ファイル名だけと件数だけは使わない。node scripts/search-lines.mjs か rg -n。');
}

if (isEnvFile || isShellHit) {
	deny('[block_env_read] 規約1: .env / シークレット環境変数の読み取りは禁止（人間がパイプ渡し）。');
}

allow();
