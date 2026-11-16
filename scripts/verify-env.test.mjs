import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVerifyEnvServer, VERIFY_ENV_HOST, VERIFY_ENV_PORT } from './verify-env-serve.mjs';
import { INITIAL_VERIFY_ENV_HTML } from './lib/verify-env-page.mjs';

test('検証環境の画面は確認前と確認後の文言を持つ', () => {
	const html = readFileSync(new URL('../verify-env/index.html', import.meta.url), 'utf8');
	assert.match(html, /未確認/);
	assert.match(html, />確認する</);
	assert.match(html, /確認できた/);
	assert.equal(html, INITIAL_VERIFY_ENV_HTML);
});

test('検証環境は 127.0.0.1 の待受でその画面を返す', async () => {
	assert.equal(VERIFY_ENV_HOST, '127.0.0.1');
	assert.equal(VERIFY_ENV_PORT, 8765);
	const server = createVerifyEnvServer();
	await new Promise((resolve) => server.listen(0, VERIFY_ENV_HOST, resolve));
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	try {
		const res = await fetch(`http://${VERIFY_ENV_HOST}:${address.port}/`);
		assert.equal(res.status, 200);
		assert.match(res.headers.get('content-type') ?? '', /text\/html/);
		assert.match(await res.text(), /確認する/);
		const missing = await fetch(`http://${VERIFY_ENV_HOST}:${address.port}/nope`);
		assert.equal(missing.status, 404);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test('検証環境は配るたびに画面を読み直す', async () => {
	let html = '<p id="status">未確認</p>';
	const server = createVerifyEnvServer(undefined, () => html);
	await new Promise((resolve) => server.listen(0, VERIFY_ENV_HOST, resolve));
	const address = server.address();
	assert.ok(address && typeof address === 'object');
	try {
		const first = await fetch(`http://${VERIFY_ENV_HOST}:${address.port}/`);
		assert.match(await first.text(), /未確認/);
		html = '<p id="status">未確認</p>戻した';
		const second = await fetch(`http://${VERIFY_ENV_HOST}:${address.port}/`);
		assert.match(await second.text(), /戻した/);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
});

test('Cursor の start が検証環境を起動する', () => {
	const cloud = JSON.parse(readFileSync(new URL('../.cursor/environment.json', import.meta.url), 'utf8'));
	assert.match(cloud.start, /^node scripts\/verify-env-serve\.mjs$/);
	assert.match(cloud.install, /pnpm install --frozen-lockfile/);
	assert.doesNotMatch(cloud.install, /--apply/);
});
