import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandSimpleAssignments } from './lib/shell-assign.mjs';

test('同じコマンドの代入を展開する', () => {
	const r = expandSimpleAssignments('X=--no-verify; git commit $X -m "feat: 抜け道。"');
	assert.match(r.text, /git commit --no-verify /);
	const braced = expandSimpleAssignments("A=--no-; B=verify; git commit \${A}\${B} -m \"feat: 抜け道。\"");
	assert.match(braced.text, /git commit --no-verify /);
});

test('単一引用符の中は展開しない', () => {
	const r = expandSimpleAssignments("X=--no-verify; printf 'git commit $X' | sh");
	assert.match(r.text, /git commit \$X/);
});

test('heredoc の -m は壊さない', () => {
	const cmd = `git commit -m "$(cat <<'EOF'
feat: pre-commit を常時起動する。

本文で回避フラグの名前に触れる。
EOF
)"`;
	const r = expandSimpleAssignments(cmd);
	assert.equal(r.text, cmd);
});
