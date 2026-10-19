import { existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBlockedEnvPath } from './blocked-env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function productTypecheckPlan(root, exists = existsSync) {
	const tree = ['src', 'app'].find((rel) => exists(join(root, rel)));
	if (!tree) return null;
	const config = ['tsconfig.json', 'src/tsconfig.json', 'app/tsconfig.json'].find((rel) => exists(join(root, rel)));
	if (!config) {
		return { ok: false, message: '[pre-commit] プロダクトの tsconfig が無い。型は tsc --noEmit で見る。' };
	}
	return { ok: true, config };
}

export function runPreCommit() {
	try {
		const staged = execSync('git diff --cached --name-only', { cwd: ROOT, encoding: 'utf8' })
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		const badEnv = staged.find(isBlockedEnvPath);
		if (badEnv) {
			return { ok: false, message: `[pre-commit] 規約1: 実 .env(${badEnv}) をステージしています。除外してください。` };
		}
	} catch (e) {
		return { ok: false, message: `[pre-commit] staged 一覧に失敗: ${String(e && e.message)}` };
	}

	const typecheck = productTypecheckPlan(ROOT);
	if (typecheck && !typecheck.ok) return { ok: false, message: typecheck.message };
	if (typecheck?.ok) {
		const tsc = join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');
		if (!existsSync(tsc)) {
			return { ok: false, message: '[pre-commit] typescript が無い。pnpm install のあと tsc --noEmit を通す。' };
		}
		try {
			execFileSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false', '-p', join(ROOT, typecheck.config)], {
				cwd: ROOT,
				encoding: 'utf8'
			});
		} catch (e) {
			return {
				ok: false,
				message:
					'[pre-commit] 型チェック (tsc --noEmit) が失敗。緑にしてから commit する。\n' +
					String((e && (e.stdout || e.stderr || e.message)) || '').slice(0, 2000)
			};
		}
	}

	try {
		execSync('node scripts/feature-gate.mjs', {
			cwd: ROOT,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe']
		});
	} catch (e) {
		return {
			ok: false,
			message:
				'[pre-commit] feature-gate が失敗。出力を直してから commit する。\n' +
				String((e && (e.stderr || e.stdout || e.message)) || '').slice(0, 4000)
		};
	}
	return { ok: true, message: '' };
}
