import { isBlockedEnvPath } from './blocked-env.mjs';

const PATTERNS = [
	/sk-[A-Za-z0-9]{20,}/,
	/SUPABASE_SERVICE_ROLE_KEY\s*[:=]/,
	/STRIPE_SECRET_KEY\s*[:=]/,
	/STRIPE_WEBHOOK_SECRET\s*[:=]/,
	/OPENAI_API_KEY\s*[:=]\s*['"]?[A-Za-z0-9\-_]{10,}/,
	/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][A-Za-z0-9\-_]{16,}['"]/i
];

export function secretWriteMessage(filePath, content) {
	const fp = String(filePath ?? '').replace(/\\/g, '/');
	if (!fp) return '';
	if (isBlockedEnvPath(fp)) {
		return '[block_secret_write] 規約1: 実 .env の書き込み/コミットは禁止（.env.example と .env.sample のみ可）。';
	}
	const text = String(content ?? '');
	if (!PATTERNS.some((pattern) => pattern.test(text))) return '';
	return (
		'[block_secret_write] 規約1: シークレットらしき値を ' +
		fp +
		' に埋め込もうとしています。' +
		' PUBLIC_ 以外は server(`$env/static/private`)/Worker の秘密のみ。'
	);
}
