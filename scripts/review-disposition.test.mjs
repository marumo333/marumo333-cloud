import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispositionErrors, selfReviewErrors } from './lib/review-disposition.mjs';

test('直すだけを適用し、緑の noEmit を不正解にしない', () => {
	assert.deepEqual(
		dispositionErrors({
			noEmit: 'green',
			pass: 1,
			findings: [
				{ bucket: '直す', applied: true },
				{ bucket: '検討' },
				{ bucket: '記録' },
				{ bucket: '却下' }
			]
		}),
		[]
	);
});

test('検討をコードに反映すると拒否する', () => {
	const errors = dispositionErrors({
		noEmit: 'green',
		pass: 1,
		findings: [{ bucket: '検討', applied: true }]
	});
	assert.equal(errors.length, 1);
	assert.match(errors[0], /直す以外はコードを変えない/);
});

test('直すが残るあいだ同じ直すを繰り返し、0 で止める', () => {
	assert.deepEqual(
		selfReviewErrors([
			{ pass: 1, noEmit: 'green', findings: [{ id: 'a', bucket: '直す', applied: true }] },
			{ pass: 2, noEmit: 'green', findings: [] }
		]),
		[]
	);
});

test('新しい指摘を探す二周目と、緑を不正解と呼ぶ指摘は拒否する', () => {
	const errors = selfReviewErrors([
		{ pass: 1, noEmit: 'green', findings: [{ id: 'a', bucket: '直す', applied: true }] },
		{ pass: 2, noEmit: 'green', findings: [{ id: 'b', bucket: '直す', claimsIncorrect: true }] }
	]);
	assert.ok(errors.some((e) => e === '二周目は開かない'));
	assert.ok(errors.some((e) => e.includes('不正解にしない')));
	const afterZero = selfReviewErrors([
		{ pass: 1, noEmit: 'green', findings: [] },
		{ pass: 2, noEmit: 'green', findings: [] }
	]);
	assert.ok(afterZero.some((e) => e.includes('直すが 0 のあと')));
});
