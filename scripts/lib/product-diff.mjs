/** 差分パスを、振る舞い検査と型検査に分ける。 */
export function checksForProductPaths(paths) {
	const list = Array.isArray(paths) ? paths.map(String) : [];
	return {
		behavior: list.some((p) => p.startsWith('features/')),
		types: list.some((p) => p.startsWith('src/') || p.startsWith('app/'))
	};
}
