import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCheckBehavior } from './check-behavior.mjs';
import { runInit } from './init.mjs';
import { runStartFeature } from './start-feature.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function root() {
	return mkdtempSync(join(tmpdir(), 'procedure-'));
}

function put(dir, rel, body) {
	const path = join(dir, rel);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, body);
}

function between(text, start, end) {
	const from = text.indexOf(start);
	assert.ok(from >= 0, start);
	const rest = text.slice(from);
	if (!end) return rest;
	const to = rest.indexOf(end, start.length);
	assert.ok(to > 0, end);
	return rest.slice(0, to);
}

function bash(text) {
	const blocks = [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
	assert.equal(blocks.length, 1);
	return blocks[0];
}

test('このリポジトリの手順は見出しも機能も作らず、テンプレートの蓄積を残す', () => {
	const dir = root();
	put(dir, 'policy/canon.rego', 'package harness.canon\n');
	put(dir, 'package.json', JSON.stringify({ name: 'marumo-cloud' }));
	put(dir, 'docs/survey.md', '残す\n');
	const init = runInit(dir);
	assert.equal(init.ok, true);
	assert.ok(init.lines.some((line) => line.includes('pnpm install')));
	assert.equal(existsSync(join(dir, 'AGENTS.md')), false);
	const kept = runInit(dir, {
		product: true,
		apply: true,
		origin: 'https://github.com/marumo333/marumo333-cloud'
	});
	assert.equal(kept.ok, true);
	assert.ok(kept.lines.some((line) => line.includes('テンプレートの蓄積は残す')));
	assert.equal(readFileSync(join(dir, 'docs/survey.md'), 'utf8'), '残す\n');
	const feature = runStartFeature(dir, { slug: 'checkout' });
	assert.equal(feature.ok, false);
	assert.equal(existsSync(join(dir, 'features/checkout/requirements.md')), false);
	assert.ok(feature.lines.some((line) => line.includes('ハーネス')));
});

test('名前を変えたプロダクトは init のあと失敗するテストを置き、検査は失敗する', () => {
	const dir = root();
	put(dir, 'package.json', JSON.stringify({ name: 'sample-product' }));
	const init = runInit(dir, {
		spawn() {
			throw new Error('依存は入れない');
		}
	});
	assert.equal(init.ok, true);
	for (const name of ['AGENTS.md', 'docs/GLOSSARY.md', 'ACTIONS.md']) {
		assert.equal(existsSync(join(dir, name)), true, name);
	}
	const feature = runStartFeature(dir, { slug: 'checkout' });
	assert.equal(feature.ok, true);
	assert.equal(existsSync(join(dir, 'features/checkout/checkout.test.mjs')), true);
	const checked = runCheckBehavior(dir);
	assert.equal(checked.ok, false);
	assert.ok(checked.lines.some((line) => line.includes('振る舞いが空')));
	assert.ok(checked.lines.some((line) => line.includes('置き換えられていない')));
});

test('プロダクトを始めるは、このリポジトリと名前を変えたプロダクトで手順が違う', () => {
	const template = readFileSync(join(ROOT, 'TEMPLATE.md'), 'utf8');
	const section = between(template, '## プロダクトを始める', '\n## ');
	const here = between(section, '### このリポジトリ', '### 名前を変えたプロダクト');
	const renamed = section.slice(section.indexOf('### 名前を変えたプロダクト'));
	const hereCmd = bash(here);
	assert.match(here, /機能ファイルを作らない/);
	assert.doesNotMatch(hereCmd, /start-feature/);
	assert.match(hereCmd, /pnpm install/);
	const productCmd = bash(renamed);
	assert.match(productCmd, /node scripts\/init\.mjs\n/);
	assert.match(productCmd, /node scripts\/start-feature\.mjs <slug>/);
	assert.match(productCmd, /node scripts\/check-behavior\.mjs/);
	assert.doesNotMatch(productCmd, /--apply/);
	assert.match(renamed, /--product --apply/);
	assert.match(renamed, /テンプレートの remote では消さない/);
	assert.match(renamed, /二度目は既存ファイルを上書きしない/);
});
