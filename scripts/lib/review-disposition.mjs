/** 親の分類。直すだけがコードを変える。直すが 0 になるまで同じ直すだけを繰り返す。 */

export const BUCKETS = ['直す', '検討', '記録', '却下'];
export const SELF_REVIEW_CAP = 4;

/**
 * @param {{ noEmit: 'green' | 'red', pass?: number, findings: { bucket: string, applied?: boolean, claimsIncorrect?: boolean }[] }} record
 */
export function dispositionErrors(record) {
	/** @type {string[]} */
	const errors = [];
	if (record.noEmit !== 'green' && record.noEmit !== 'red') errors.push('noEmit は green か red');
	for (const finding of record.findings ?? []) {
		if (!BUCKETS.includes(finding.bucket)) errors.push(`分類が不正: ${finding.bucket}`);
		if (finding.applied && finding.bucket !== '直す') errors.push('直す以外はコードを変えない');
		if (record.noEmit === 'green' && finding.claimsIncorrect) errors.push('noEmit が緑の変更を不正解にしない');
	}
	return errors;
}

/**
 * 直すが残るあいだ同じ直すだけを繰り返す。0 のあとと、新しい指摘を探す周は開かない。
 * @param {{ pass: number, noEmit: 'green' | 'red', findings: { id?: string, bucket: string, applied?: boolean, claimsIncorrect?: boolean }[] }[]} passes
 */
export function selfReviewErrors(passes) {
	/** @type {string[]} */
	const errors = [];
	if (!Array.isArray(passes) || passes.length === 0) return ['自己レビューが無い'];
	/** @type {string[] | null} */
	let prevFix = null;
	for (let i = 0; i < passes.length; i += 1) {
		const record = passes[i];
		if (!Number.isInteger(record.pass) || record.pass !== i + 1) errors.push('自己レビューの周が連続していない');
		if (record.pass > SELF_REVIEW_CAP) errors.push('自己レビューの上限を超えた');
		if (prevFix && prevFix.length === 0) errors.push('直すが 0 のあと周を開かない');
		/** @type {string[]} */
		const fix = [];
		for (const finding of record.findings ?? []) {
			if (finding.bucket !== '直す') continue;
			fix.push(finding.id ?? '');
			if (prevFix && finding.id && !prevFix.includes(finding.id)) errors.push('二周目は開かない');
		}
		errors.push(...dispositionErrors(record));
		prevFix = fix;
	}
	if (prevFix && prevFix.length !== 0) errors.push(`直すが ${prevFix.length}`);
	return [...new Set(errors)];
}
