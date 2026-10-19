/** 同じコマンド内の単純な NAME=value を、$NAME と ${NAME} へ展開する。完全なシェル解析ではない。 */

const NAME = '[A-Za-z_][A-Za-z0-9_]*';

/**
 * @param {string} command
 * @param {Map<string, string>} [inherited]
 */
export function expandSimpleAssignments(command, inherited) {
	const env = new Map(inherited instanceof Map ? inherited : []);
	return { text: rewrite(String(command ?? ''), env), env };
}

/**
 * @param {string} s
 * @param {Map<string, string>} env
 */
function rewrite(s, env) {
	let i = 0;
	let out = '';
	let wordStart = true;
	while (i < s.length) {
		const c = s[i];
		if (c === '<' && s[i + 1] === '<') {
			const n = endOfHeredoc(s, i);
			if (n > i) {
				out += s.slice(i, n);
				i = n;
				wordStart = true;
				continue;
			}
		}
		if (wordStart) {
			const assigned = tryAssignment(s, i, env);
			if (assigned) {
				out += s.slice(i, assigned.next);
				i = assigned.next;
				wordStart = false;
				continue;
			}
		}
		if (c === "'") {
			const end = s.indexOf("'", i + 1);
			if (end < 0) {
				out += s.slice(i);
				break;
			}
			out += s.slice(i, end + 1);
			i = end + 1;
			wordStart = false;
			continue;
		}
		if (c === '"') {
			const quoted = readDouble(s, i, env);
			out += quoted.expanded ? `"${quoted.value}"` : s.slice(i, quoted.next);
			i = quoted.next;
			wordStart = false;
			continue;
		}
		if (c === '$' && s[i + 1] === '(') {
			const n = skipDollarParen(s, i);
			out += s.slice(i, n);
			i = n;
			wordStart = false;
			continue;
		}
		if (c === '`') {
			const n = skipBacktick(s, i);
			out += s.slice(i, n);
			i = n;
			wordStart = false;
			continue;
		}
		if (/\s/.test(c) || isSep(c)) {
			out += c;
			i += 1;
			wordStart = true;
			continue;
		}
		const word = readExpandedWord(s, i, env);
		if (word.next === i) {
			out += c;
			i += 1;
			wordStart = false;
			continue;
		}
		out += word.text;
		i = word.next;
		wordStart = false;
	}
	return out;
}

/**
 * @param {string} s
 * @param {number} i
 * @param {Map<string, string>} env
 */
function tryAssignment(s, i, env) {
	const m = new RegExp(`^(${NAME})=`) .exec(s.slice(i));
	if (!m) return null;
	const name = m[1];
	let j = i + m[0].length;
	let value = '';
	if (s[j] === "'") {
		const end = s.indexOf("'", j + 1);
		if (end < 0) return null;
		value = s.slice(j + 1, end);
		j = end + 1;
	} else if (s[j] === '"') {
		const quoted = readDouble(s, j, env);
		value = quoted.value;
		j = quoted.next;
	} else {
		const word = readExpandedWord(s, j, env);
		value = word.text;
		j = word.next;
	}
	env.set(name, value);
	return { next: j };
}

/**
 * @param {string} s
 * @param {number} i
 * @param {Map<string, string>} env
 */
function readDouble(s, i, env) {
	let j = i + 1;
	let value = '';
	let expanded = false;
	while (j < s.length && s[j] !== '"') {
		if (s[j] === '\\' && j + 1 < s.length) {
			value += s[j + 1];
			j += 2;
			continue;
		}
		if (s[j] === '$' && s[j + 1] === '(') {
			const n = skipDollarParen(s, j);
			value += s.slice(j, n);
			j = n;
			continue;
		}
		if (s[j] === '`') {
			const n = skipBacktick(s, j);
			value += s.slice(j, n);
			j = n;
			continue;
		}
		const exp = tryExpand(s, j, env);
		if (exp) {
			value += exp.value;
			j = exp.next;
			expanded = true;
			continue;
		}
		value += s[j];
		j += 1;
	}
	return { value, expanded, next: j < s.length ? j + 1 : j };
}

/**
 * @param {string} s
 * @param {number} i
 * @param {Map<string, string>} env
 */
function readExpandedWord(s, i, env) {
	let j = i;
	let text = '';
	while (j < s.length) {
		const c = s[j];
		if (c === '"' || c === "'" || /\s/.test(c) || isSep(c)) break;
		if (c === '\\' && j + 1 < s.length) {
			text += s[j + 1];
			j += 2;
			continue;
		}
		if (c === '$' && s[j + 1] === '(') {
			const n = skipDollarParen(s, j);
			text += s.slice(j, n);
			j = n;
			continue;
		}
		if (c === '`') {
			const n = skipBacktick(s, j);
			text += s.slice(j, n);
			j = n;
			continue;
		}
		const exp = tryExpand(s, j, env);
		if (exp) {
			text += exp.value;
			j = exp.next;
			continue;
		}
		text += c;
		j += 1;
	}
	return { text, next: j };
}

/**
 * @param {string} s
 * @param {number} i
 * @param {Map<string, string>} env
 */
function tryExpand(s, i, env) {
	if (s[i] !== '$') return null;
	if (s[i + 1] === '{') {
		const end = s.indexOf('}', i + 2);
		if (end < 0) return null;
		const name = s.slice(i + 2, end);
		if (!new RegExp(`^${NAME}$`).test(name) || !env.has(name)) return null;
		return { value: env.get(name), next: end + 1 };
	}
	const m = new RegExp(`^${NAME}`).exec(s.slice(i + 1));
	if (!m || !env.has(m[0])) return null;
	return { value: env.get(m[0]), next: i + 1 + m[0].length };
}

/** @param {string} c */
function isSep(c) {
	return c === ';' || c === '&' || c === '|' || c === '(' || c === ')' || c === '<' || c === '>';
}

/**
 * @param {string} s
 * @param {number} i
 */
function skipDollarParen(s, i) {
	let j = i + 2;
	let depth = 1;
	while (j < s.length && depth > 0) {
		const c = s[j];
		if (c === '\\' && j + 1 < s.length) {
			j += 2;
			continue;
		}
		if (c === "'") {
			const end = s.indexOf("'", j + 1);
			j = end < 0 ? s.length : end + 1;
			continue;
		}
		if (c === '"') {
			j += 1;
			while (j < s.length && s[j] !== '"') {
				if (s[j] === '\\' && j + 1 < s.length) {
					j += 2;
					continue;
				}
				j += 1;
			}
			if (j < s.length) j += 1;
			continue;
		}
		if (c === '`') {
			j = skipBacktick(s, j);
			continue;
		}
		if (c === '(') {
			depth += 1;
			j += 1;
			continue;
		}
		if (c === ')') {
			depth -= 1;
			j += 1;
			continue;
		}
		j += 1;
	}
	return j;
}

/**
 * @param {string} s
 * @param {number} i
 */
function skipBacktick(s, i) {
	let j = i + 1;
	while (j < s.length) {
		if (s[j] === '\\' && j + 1 < s.length) {
			j += 2;
			continue;
		}
		if (s[j] === '`') return j + 1;
		j += 1;
	}
	return s.length;
}

/**
 * @param {string} s
 * @param {number} i
 */
function endOfHeredoc(s, i) {
	let j = i + 2;
	if (s[j] === '-') j += 1;
	let delim = '';
	if (s[j] === "'" || s[j] === '"') {
		const q = s[j];
		const end = s.indexOf(q, j + 1);
		if (end < 0) return s.length;
		delim = s.slice(j + 1, end);
		j = end + 1;
	} else {
		const m = new RegExp(`^${NAME}`).exec(s.slice(j));
		if (!m) return i;
		delim = m[0];
		j += m[0].length;
	}
	const nl = s.indexOf('\n', j);
	if (nl < 0) return s.length;
	let k = nl + 1;
	while (k <= s.length) {
		const nl2 = s.indexOf('\n', k);
		const line = s.slice(k, nl2 < 0 ? s.length : nl2);
		if (line === delim || line.trim() === delim) return nl2 < 0 ? s.length : nl2 + 1;
		if (nl2 < 0) return s.length;
		k = nl2 + 1;
	}
	return s.length;
}
