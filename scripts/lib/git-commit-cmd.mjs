/** `git commit` コマンド列から hook 回避と -m を取る。 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '../..'));

export function parseGitCommitCommand(raw) {
	const src = String(raw ?? '');
	const pulled = pullHeredocMessages(src);
	const tokens = tokenize(pulled.cmd);
	let i = 0;
	while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;
	while (i < tokens.length && !/(^|\/)git$/.test(tokens[i])) i += 1;
	if (i >= tokens.length) return empty();
	i += 1;

	let skipsHooks = false;
	let foreignRepo = false;
	const messages = pulled.messages.slice();

	while (i < tokens.length) {
		const t = tokens[i];
		if (t === '-c' || t === '--config') {
			skipsHooks = skipsHooks || hooksPathBypass(tokens[i + 1] || '');
			i += 2;
			continue;
		}
		if (t.startsWith('--config=')) {
			skipsHooks = skipsHooks || hooksPathBypass(t.slice('--config='.length));
			i += 1;
			continue;
		}
		if (t === '-C' || t === '--git-dir' || t === '--work-tree') {
			foreignRepo = foreignRepo || isForeignRepo(tokens[i + 1] || '');
			i += 2;
			continue;
		}
		if (t.startsWith('--git-dir=') || t.startsWith('--work-tree=')) {
			foreignRepo = foreignRepo || isForeignRepo(t.slice(t.indexOf('=') + 1));
			i += 1;
			continue;
		}
		if (t === '--no-pager' || t === '--paginate') {
			i += 1;
			continue;
		}
		break;
	}

	if (tokens[i] !== 'commit') return empty();
	i += 1;

	while (i < tokens.length) {
		const t = tokens[i];
		if (t === '--') break;
		if (isNoVerifyLongOpt(t)) {
			skipsHooks = true;
			i += 1;
			continue;
		}
		if (t === '--message' || t === '-m') {
			messages.push(tokens[i + 1] ?? '');
			i += 2;
			continue;
		}
		if (t.startsWith('--message=')) {
			messages.push(t.slice('--message='.length));
			i += 1;
			continue;
		}
		if (t.includes('$(') || t.includes('`')) {
			skipsHooks = true;
			i += 1;
			continue;
		}
		if (t.startsWith('-') && !t.startsWith('--')) {
			const chars = t.slice(1).split('');
			let jumped = false;
			for (let c = 0; c < chars.length; c += 1) {
				const ch = chars[c];
				if (ch === 'n') skipsHooks = true;
				if (ch === 'm') {
					const rest = chars.slice(c + 1).join('');
					if (rest) messages.push(rest);
					else {
						messages.push(tokens[i + 1] ?? '');
						i += 1;
					}
					jumped = true;
					break;
				}
				if ('FtCc'.includes(ch)) {
					const rest = chars.slice(c + 1).join('');
					if (!rest) i += 1;
					jumped = true;
					break;
				}
			}
			i += 1;
			if (jumped) continue;
			continue;
		}
		i += 1;
	}

	return { isCommit: true, skipsHooks, foreignRepo, messages };
}

function empty() {
	return { isCommit: false, skipsHooks: false, foreignRepo: false, messages: [] };
}

function isNoVerifyLongOpt(t) {
	if (!t.startsWith('--')) return false;
	const name = t.split('=')[0];
	return name.length >= '--no-ver'.length && '--no-verify'.startsWith(name);
}

function hooksPathBypass(kv) {
	if (!/^core\.hooksPath=/i.test(kv)) return false;
	const v = kv.slice(kv.indexOf('=') + 1).trim();
	return !/(^|\/)scripts\/githooks\/?$/.test(v);
}

function isForeignRepo(dest) {
	if (!dest || dest === '.' || dest === './') return false;
	const resolved = resolve(REPO_ROOT, dest);
	return resolved !== REPO_ROOT && !resolved.startsWith(REPO_ROOT + '/');
}

function pullHeredocMessages(cmd) {
	const messages = [];
	const re = /-m\s+"\$\(cat\s+<<(['"]?)(\w+)\1\r?\n([\s\S]*?)\r?\n\2\s*\)"/g;
	const next = cmd.replace(re, (_all, _q, _tag, body) => {
		messages.push(String(body).replace(/\n$/, ''));
		return '';
	});
	return { cmd: next, messages };
}

function tokenize(cmd) {
	const tokens = [];
	let i = 0;
	const s = String(cmd);
	while (i < s.length) {
		if (/\s/.test(s[i])) {
			i += 1;
			continue;
		}
		if (s[i] === '"' || s[i] === "'") {
			const q = s[i];
			i += 1;
			let t = '';
			while (i < s.length && s[i] !== q) {
				if (s[i] === '\\' && q === '"' && i + 1 < s.length) {
					t += s[i + 1];
					i += 2;
					continue;
				}
				t += s[i];
				i += 1;
			}
			if (i < s.length) i += 1;
			tokens.push(t);
			continue;
		}
		let t = '';
		while (i < s.length && !/\s/.test(s[i])) {
			t += s[i];
			i += 1;
		}
		tokens.push(t);
	}
	return tokens;
}
