import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checksForProductPaths } from './lib/product-diff.mjs';
import { productTypecheckPlan } from './lib/run-pre-commit.mjs';

test('プロダクト差分は振る舞いと型に分かれる', () => {
	assert.deepEqual(checksForProductPaths(['scripts/feature-gate.mjs', 'docs/learnings.md']), {
		behavior: false,
		types: false
	});
	assert.deepEqual(checksForProductPaths(['features/demo/requirements.md', 'src/main.ts']), {
		behavior: true,
		types: true
	});
	assert.deepEqual(checksForProductPaths(['app/page.tsx']), { behavior: false, types: true });
});

test('型検査は tsc --noEmit で、pnpm run check は返さない', () => {
	const present = new Set(['src', 'tsconfig.json', 'package.json']);
	const plan = productTypecheckPlan('/repo', (path) => present.has(path.replace('/repo/', '')));
	assert.equal(plan.ok, true);
	assert.equal(plan.config, 'tsconfig.json');
	const missing = productTypecheckPlan('/repo', (path) => path.endsWith('/src'));
	assert.equal(missing.ok, false);
	assert.match(missing.message, /tsc --noEmit/);
	assert.doesNotMatch(missing.message, /pnpm run check/);
	assert.equal(productTypecheckPlan('/repo', () => false), null);
});
