/** 検証環境の初期画面。プロダクトの --apply はここへ戻す。 */
export const INITIAL_VERIFY_ENV_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <title>検証環境</title>
</head>
<body>
  <main>
    <h1>検証環境</h1>
    <p id="status">未確認</p>
    <button id="confirm" type="button">確認する</button>
  </main>
  <script>
    document.getElementById('confirm').addEventListener('click', () => {
      document.getElementById('status').textContent = '確認できた';
    });
  </script>
</body>
</html>
`;
