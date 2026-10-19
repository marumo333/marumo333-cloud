/** hook の標準入力。空は許可側の初期値。壊れた JSON は拒否。 */
export function parseHookInput(raw) {
	const text = String(raw ?? '');
	if (!text.trim()) return { ok: true, data: {} };
	try {
		const data = JSON.parse(text);
		if (!data || typeof data !== 'object' || Array.isArray(data)) {
			return { ok: false, error: 'hook 入力がオブジェクトではない' };
		}
		return { ok: true, data };
	} catch {
		return { ok: false, error: 'hook 入力の JSON が壊れている' };
	}
}
