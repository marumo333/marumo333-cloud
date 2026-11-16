/** Cursor のクラウドが起動時に配る検証環境。待受は 127.0.0.1 だけ。 */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VERIFY_ENV_HOST = '127.0.0.1';
export const VERIFY_ENV_PORT = 8765;

const pagePath = join(dirname(fileURLToPath(import.meta.url)), '..', 'verify-env', 'index.html');

export function createVerifyEnvServer(html, readPage = () => readFileSync(pagePath)) {
	return createServer((req, res) => {
		let pathname = '/';
		try {
			pathname = new URL(req.url ?? '/', `http://${VERIFY_ENV_HOST}`).pathname;
		} catch {
			pathname = '/';
		}
		if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
			let body = html;
			if (body === undefined) {
				try {
					body = readPage();
				} catch {
					res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
					res.end('検証環境を読めない');
					return;
				}
			}
			res.writeHead(200, {
				'content-type': 'text/html; charset=utf-8',
				'cache-control': 'no-store'
			});
			res.end(body);
			return;
		}
		res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
		res.end('not found');
	});
}

function alreadyServing() {
	return fetch(`http://${VERIFY_ENV_HOST}:${VERIFY_ENV_PORT}/`)
		.then(async (res) => res.status === 200 && (await res.text()).includes('検証環境'))
		.catch(() => false);
}

function listen() {
	const server = createVerifyEnvServer();
	server.on('error', (err) => {
		if (err.code !== 'EADDRINUSE') {
			console.error(err);
			process.exit(1);
		}
		alreadyServing().then((ok) => process.exit(ok ? 0 : 1));
	});
	server.listen(VERIFY_ENV_PORT, VERIFY_ENV_HOST, () => {
		console.log(`検証環境 http://${VERIFY_ENV_HOST}:${VERIFY_ENV_PORT}`);
	});
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entry) listen();
