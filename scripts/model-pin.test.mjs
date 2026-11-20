import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasForeignModel } from './lib/parallel-slices.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
	return readFileSync(join(ROOT, rel), 'utf8');
}

function frontmatter(rel) {
	const text = read(rel);
	const end = text.indexOf('\n---', 3);
	assert.ok(end > 0, `${rel} に frontmatter が無い`);
	return text.slice(0, end);
}

const LIVING = [
	'cycle/model-routing.yaml',
	'AGENTS.md',
	'README.md',
	'TEMPLATE.md',
	'docs/multi-agent-and-pins.md',
	'.cursor/skills/parallel-dispatch/SKILL.md',
	'.cursor/skills/harness-api-budget/SKILL.md',
	'.cursor/skills/plan-confirm/SKILL.md',
	'.cursor/skills/adversarial-review/SKILL.md',
	'.cursor/skills/harness-audit/SKILL.md',
	'.cursor/agents/backend-architect.md',
	'.cursor/agents/security-reviewer.md',
	'docs/architecture/review-overview.mmd',
	'docs/architecture/runtime-overview.mmd',
	'docs/architecture/audit-overview.mmd',
	'docs/architecture/host-entry-as-is-to-be.mmd'
];

test('どの agent の frontmatter の model も grok-4.7-xhigh', () => {
	const agents = readdirSync(join(ROOT, '.cursor/agents')).filter((name) => name.endsWith('.md'));
	assert.deepEqual(agents.sort(), ['backend-architect.md', 'security-reviewer.md']);
	for (const name of agents) {
		assert.match(frontmatter(`.cursor/agents/${name}`), /^model: grok-4\.7-xhigh$/m, name);
	}
	assert.equal(existsSync(join(ROOT, '.cursor/agents/verifier.md')), false);
	assert.equal(existsSync(join(ROOT, '.cursor/agents/reflector.md')), false);
	assert.equal(existsSync(join(ROOT, '.cursor/log_subagent_model.mjs')), false);
	assert.match(read('.cursor/skills/verify/SKILL.md'), /起動しない/);
	assert.match(read('.cursor/skills/reflect/SKILL.md'), /起動しない/);
});

test('生きた契約の製品スラッグは grok-4.7-xhigh だけ', () => {
	for (const rel of LIVING) {
		const text = read(rel);
		assert.match(text, /grok-4\.7-xhigh/, rel);
		assert.equal(hasForeignModel(text), false, rel);
	}
	const routing = read('cycle/model-routing.yaml');
	assert.match(routing, /model: grok-4\.7-xhigh/);
	assert.match(routing, /parent_chat: grok-4\.7-xhigh/);
	assert.match(routing, /implement_seat: grok-4\.7-xhigh/);
	assert.match(routing, /parent: parent/);
	assert.doesNotMatch(routing, /fable_pin/);
	assert.doesNotMatch(routing, /sonnet_pin/);
	assert.doesNotMatch(routing, /grok_task:/);
	assert.doesNotMatch(routing, /host-default/);
	assert.match(read('docs/decisions/0049-grok47-opus55-generation.md'), /grok-4\.7-high/);
	assert.match(read('docs/decisions/0049-grok47-opus55-generation.md'), /grok-4\.7-xhigh/);
	assert.match(read('docs/multi-agent-and-pins.md'), /arXiv:2503\.13657/);
	assert.match(read('docs/multi-agent-and-pins.md'), /製品スラッグ/);
	assert.match(read('docs/multi-agent-and-pins.md'), /grok-4\.7-xhigh/);
	assert.match(read('README.md'), /docs\/multi-agent-and-pins\.md/);
});

test('commit hook はホストを聞かず、クラウドも手元も質問しない', () => {
	const files = [
		'scripts/init.mjs',
		'scripts/install-git-hooks.mjs',
		'scripts/lib/run-pre-commit.mjs',
		'scripts/githooks/pre-commit',
		'scripts/githooks/commit-msg',
		'scripts/githooks/pre-merge-commit',
		'.cursor/hooks.json',
		'.cursor/hooks/pre-commit.mjs',
		'.cursor/hooks/block-env-read.mjs',
		'.cursor/hooks/code-mode.mjs',
		'.cursor/hooks/pr-open.mjs',
		'.cursor/hooks/block-secret-write.mjs'
	];
	for (const rel of files) {
		const text = read(rel);
		assert.doesNotMatch(text, /readline|createInterface|isTTY|process\.stdin/, rel);
		assert.doesNotMatch(text, /codex か|Claude か|Cursor か/, rel);
	}
	assert.doesNotMatch(read('scripts/install-git-hooks.mjs'), /setup-host/);
	assert.equal(existsSync(join(ROOT, 'scripts/setup-host.mjs')), false);
	assert.equal(existsSync(join(ROOT, 'scripts/lib/setup-host.mjs')), false);
	const pins = read('docs/multi-agent-and-pins.md');
	assert.match(pins, /commit hook はホストを聞かない/);
	assert.match(pins, /プロバイダとモデルは聞かない/);
	assert.doesNotMatch(pins, /一度だけ選ぶ/);
	assert.match(pins, /共有の yaml に書く/);
	assert.match(pins, /入口は `\.cursor\/hooks\.json` とルートの `AGENTS\.md`/);
	assert.match(pins, /共有の yaml のモデルは grok-4\.7-xhigh/);
});

test('エージェントの入口は .cursor だけである', () => {
	assert.equal(existsSync(join(ROOT, 'CLAUDE.md')), false);
	assert.equal(existsSync(join(ROOT, '.claude')), false);
	assert.equal(existsSync(join(ROOT, '.codex')), false);
	assert.equal(existsSync(join(ROOT, '.agents')), false);
	const agents = read('AGENTS.md');
	assert.match(agents, /モデルは grok-4\.7-xhigh/);
	assert.match(agents, /エージェントのフォルダは `\.cursor\/` だけである/);
	assert.match(agents, /Cursor のクラウドで閉じる/);
	assert.doesNotMatch(agents, /このリポジトリは Cursor ハーネスのテンプレート/);
	const pins = read('docs/multi-agent-and-pins.md');
	assert.match(pins, /入口は `\.cursor\/hooks\.json` とルートの `AGENTS\.md`/);
	assert.match(pins, /`CLAUDE.md` は置かない/);
	const hostFig = read('docs/architecture/host-entry-as-is-to-be.mmd');
	assert.match(hostFig, /クラウド起動/);
	assert.match(hostFig, /git clone/);
	assert.match(hostFig, /起動時に初期化/);
	assert.match(hostFig, /cycle と docs/);
	assert.match(hostFig, /クラウドも手元も質問しない/);
	assert.doesNotMatch(hostFig, /一度だけ選ぶ/);
	assert.match(hostFig, /CLAUDE.md は置かない/);
	assert.match(hostFig, /実行モデルは grok-4\.7-xhigh/);
	assert.match(hostFig, /共有 yaml は grok-4\.7-xhigh/);
	assert.match(hostFig, /yaml が製品スラッグを名指し/);
	assert.equal(hasForeignModel(hostFig), false);
	assert.match(read('README.md'), /docs\/architecture\/host-entry-as-is-to-be\.gif/);
	assert.match(read('README.md'), /git clone のあと初期化/);
	assert.match(read('README.md'), /cycle\/events\.jsonl/);
	assert.match(read('README.md'), /docs\/decisions\//);
	assert.match(read('README.md'), /テンプレートの remote では消さない/);
	assert.match(read('.gitignore'), /!\.cursor\/environment\.json/);
	const cloud = JSON.parse(read('.cursor/environment.json'));
	assert.match(cloud.install, /pnpm install --frozen-lockfile/);
	assert.match(cloud.install, /init\.mjs --product/);
	assert.doesNotMatch(cloud.install, /--apply/);
	assert.doesNotMatch(cloud.install, /setup-host/);
	assert.match(read('AGENTS.md'), /\.cursor\/environment\.json/);
	const readme = read('README.md');
	assert.match(readme, /## 開発ホスト/);
	assert.match(readme, /開発は Cursor のクラウドに統一する/);
	assert.doesNotMatch(readme, /## 3つのプロバイダ/);
	assert.match(readme, /入口は `\.cursor\/hooks\.json` と `AGENTS\.md`/);
	assert.doesNotMatch(readme, /\.claude\//);
	assert.doesNotMatch(readme, /\.codex\//);
	assert.match(read('.cursor/hooks.json'), /pre-commit\.mjs/);
	assert.match(read('.cursor/hooks.json'), /block-env-read\.mjs/);
});

test('重ならないスライスは計画確認のあと grok-4.7-xhigh で同時に進める', () => {
	const agents = read('AGENTS.md');
	assert.match(agents, /ファイルが重ならないスライスは grok-4\.7-xhigh で同時に進めるのが既定/);
	assert.match(agents, /モデルは grok-4\.7-xhigh/);
	assert.match(agents, /重なるファイルは親が書く/);
	assert.match(agents, /枝に分けて後からマージする十数体は入れない/);
	assert.match(agents, /完成は 1 本の PR/);
	assert.doesNotMatch(agents, /実装: TDD。親が書く。/);

	const dispatch = read('.cursor/skills/parallel-dispatch/SKILL.md');
	assert.match(dispatch, /grok-4\.7-xhigh/);
	assert.match(dispatch, /スライスにモデルは書かない/);
	assert.match(dispatch, /重なるファイルは親が書く/);
	assert.match(dispatch, /完成は 1 本の PR/);
	assert.doesNotMatch(dispatch, /作業ツリー分離/);
	assert.doesNotMatch(dispatch, /best-of-n/);

	const budget = read('.cursor/skills/harness-api-budget/SKILL.md');
	assert.match(budget, /重ならないスライスを grok-4\.7-xhigh で同時に進める既定/);
	assert.match(budget, /重なるファイルの実装/);
	assert.match(budget, /完成は 1 本の PR/);
	assert.match(budget, /モデルは grok-4\.7-xhigh/);

	const pins = read('docs/multi-agent-and-pins.md');
	assert.match(pins, /重なるファイルは親が書く/);
	assert.match(pins, /1 本の PR/);
	assert.match(pins, /review-cap は変えない/);

	const readme = read('README.md');
	assert.match(readme, /重なるファイルは親が書く/);
	assert.match(readme, /完成は 1 本の PR/);
	assert.match(readme, /grok-4\.7-xhigh/);
	assert.match(readme, /docs\/multi-agent-and-pins\.md/);
});
