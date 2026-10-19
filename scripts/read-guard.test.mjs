import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureRg } from './ensure-rg.mjs';
import {
	commandDropsSearchLines,
	commandTouchesDependency,
	isBlockedDependencyPath
} from './lib/read-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('node_modules と .tools のパスは読む前に止める', () => {
	assert.equal(isBlockedDependencyPath('node_modules/left-pad/index.js'), true);
	assert.equal(isBlockedDependencyPath('.tools/opa'), true);
	assert.equal(isBlockedDependencyPath('pkg/node_modules/x'), true);
	assert.equal(isBlockedDependencyPath('scripts/lib/code-mode.mjs'), false);
	assert.equal(isBlockedDependencyPath('cycle/model-routing.yaml'), false);
});

test('依存ディレクトリを開くシェルは止め、文中の語は通す', () => {
	assert.equal(commandTouchesDependency('cat .tools/opa'), true);
	assert.equal(commandTouchesDependency('head -n 5 node_modules/left-pad/index.js'), true);
	assert.equal(commandTouchesDependency('ls .tools'), true);
	assert.equal(commandTouchesDependency('git commit -m "依存の .tools は読まない"'), false);
	assert.equal(commandTouchesDependency('rg -n PACKET_MAX_BYTES scripts'), false);
});

test('ファイル名だけと件数だけの rg は止め、一致行は通す', () => {
	assert.equal(commandDropsSearchLines('rg -l packet'), true);
	assert.equal(commandDropsSearchLines('rg --files-with-matches packet'), true);
	assert.equal(commandDropsSearchLines('rg -c packet'), true);
	assert.equal(commandDropsSearchLines('rg -n packet scripts'), false);
	assert.equal(commandDropsSearchLines('rg -n -F "inspects >= 2" scripts'), false);
	assert.equal(commandDropsSearchLines('git status -sb'), false);
});

test('beforeReadFile は .tools を拒否する', () => {
	const hook = join(ROOT, '.claude/hooks/block_env_read.mjs');
	const r = spawnSync(process.execPath, [hook], {
		input: JSON.stringify({ filePath: '.tools/opa', cwd: ROOT }),
		encoding: 'utf8'
	});
	const body = JSON.parse(r.stdout);
	assert.equal(body.permission, 'deny');
	assert.match(body.agent_message, /node_modules|\.tools/);
});

test('Claude と Codex の PreToolUse は exit 2 で止め、Cursor の JSON を返さない', () => {
	const hook = join(ROOT, '.claude/hooks/block_env_read.mjs');
	const r = spawnSync(process.execPath, [hook], {
		input: JSON.stringify({
			hook_event_name: 'PreToolUse',
			cwd: ROOT,
			tool_name: 'Bash',
			tool_input: { command: 'cat .env' }
		}),
		encoding: 'utf8'
	});
	assert.equal(r.status, 2);
	assert.match(r.stderr, /規約1/);
	assert.doesNotMatch(r.stdout, /"permission"/);
});

test('壊れた hook 入力は拒否し、典型以外の .env 読みは止めない', () => {
	const hook = join(ROOT, '.claude/hooks/block_env_read.mjs');
	const broken = spawnSync(process.execPath, [hook], { input: '{', encoding: 'utf8' });
	assert.equal(broken.status, 2);
	assert.match(broken.stderr, /壊れている/);
	for (const command of ['grep . .env', 'awk 1 .env', 'python3 -c "open(\'.env\')"', 'cp .env x.txt']) {
		const r = spawnSync(process.execPath, [hook], {
			input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_input: { command } }),
			encoding: 'utf8'
		});
		assert.equal(r.status, 0, command);
	}
});

test('複数段の .env 書き込みは拒否し、example と sample は通す', () => {
	const hook = join(ROOT, '.claude/hooks/block_secret_write.mjs');
	for (const filePath of ['.env.production.local', 'deploy/.env.staging.local', '.envrc']) {
		const denied = spawnSync(process.execPath, [hook], {
			input: JSON.stringify({ tool_input: { file_path: filePath, content: 'A=1\n' } }),
			encoding: 'utf8'
		});
		assert.equal(denied.status, 2, filePath);
		assert.match(denied.stderr, /規約1/);
	}
	for (const filePath of ['.env.example', '.env.sample', 'src/app.js']) {
		const allowed = spawnSync(process.execPath, [hook], {
			input: JSON.stringify({ tool_input: { file_path: filePath, content: 'A=1\n' } }),
			encoding: 'utf8'
		});
		assert.equal(allowed.status, 0, filePath);
	}
});

test('秘密の書き込みは src 以外も止める', () => {
	const hook = join(ROOT, '.claude/hooks/block_secret_write.mjs');
	const value = 'sk-' + 'a'.repeat(20);
	const r = spawnSync(process.execPath, [hook], {
		input: JSON.stringify({
			tool_input: { file_path: 'app/server.js', content: `const key = "${value}";` }
		}),
		encoding: 'utf8'
	});
	assert.equal(r.status, 2);
	assert.match(r.stderr, /規約1/);
	const broken = spawnSync(process.execPath, [hook], { input: '{', encoding: 'utf8' });
	assert.equal(broken.status, 2);
});

test('search-lines は一致行を返す', () => {
	const r = spawnSync(process.execPath, ['scripts/search-lines.mjs', 'export const PACKET_MAX_BYTES = 32768;'], {
		cwd: ROOT,
		encoding: 'utf8'
	});
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /PACKET_MAX_BYTES = 32768/);
});

test('search-lines は PATH の rg を使わない', () => {
	ensureRg();
	const r = spawnSync(process.execPath, ['scripts/search-lines.mjs', 'export const PACKET_MAX_BYTES = 32768;'], {
		cwd: ROOT,
		encoding: 'utf8',
		env: { ...process.env, PATH: mkdtempSync(join(tmpdir(), 'norg-')) }
	});
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /PACKET_MAX_BYTES = 32768/);
});

test('learnings の席記述は当時と現行ピンを分ける', () => {
	const text = readFileSync(join(ROOT, 'docs/learnings.md'), 'utf8');
	const line = text.split('\n').find((l) => l.includes('席は親 Grok 4.6'));
	assert.ok(line);
	assert.match(line, /当時/);
	assert.match(line, /grok-4\.7-high/);
	const routing = readFileSync(join(ROOT, 'cycle/model-routing.yaml'), 'utf8');
	assert.doesNotMatch(routing, /grok-4\.7-high/);
	assert.match(routing, /host-default/);
});
