#!/usr/bin/env node
/** HEAD、または pre-push の送信先に、code-review と security-review のマーカーが揃っているか。 */
import { readFileSync } from 'node:fs';
import { reviewGapAt, pushedShas } from './lib/pr-open.mjs';

const root = process.cwd();
const push = process.argv.includes('--push');
const shaFlag = process.argv.indexOf('--sha');
const explicit = shaFlag >= 0 ? process.argv[shaFlag + 1] : '';
const shas = push ? pushedShas(readFileSync(0, 'utf8')) : [explicit || 'HEAD'];
if (!shas.length) process.exit(0);

for (const sha of shas) {
	let missing;
	try {
		missing = reviewGapAt(root, sha);
	} catch (e) {
		console.error(`[pr-open] マーカーを読めない: ${e.message || e}`);
		process.exit(1);
	}
	if (missing.length) {
		console.error(
			`[pr-open] ${sha} にマーカーが無い: ${missing.join(', ')}。cycle/pr-review.jsonl に code-review と security-review を、マーカーを除いたツリーの sha256 で書く`
		);
		process.exit(1);
	}
}
console.log('[pr-open] レビューマーカーは揃っている');
