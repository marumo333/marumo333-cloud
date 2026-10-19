# ADR 0040: 親/trio の Grok 席＝4.6（骨格は 0033 / 0037 維持）

- 現行: 席は役割（親・実装・計画・レビュー）だけを見る。モデル ID は指定しない。この本文は世代の記録である。

- 状態: 受理（改正対象: [[0031]] [[0033]] [[0037]]。廃止ではない。第3席は [[0046]]。計画/レビューは [[0047]]）
- 改正注記: 決定の「第1席 Opus 5 は据え置き」と「今は変えない席」の Fable＝天井は [[0047]] で改正。第3は [[0046]]。世代ピンは [[0049]] で Grok 4.7 high / Opus 5.5 high。決定本文の 4.6 と Opus 5 は履歴として残す。
- 日付: 2026-08-15
- 背景:
  Grok 4.6 は 2026-08-12 に Cursor + SpaceXAI として GA
  （https://cursor.com/blog/grok-4-6 、https://x.ai/news/grok-4-6）。
  親チャットの実体は既に `cursor-grok-4.6-xhigh-fast` で動いているのに、
  文書と `model-routing.yaml` が Grok 4.5 / 旧スラッグ `grok-4.5-fast-xhigh` のまま。
  旧スラッグは Cursor 側で `cursor-grok-4.5-high-fast` に改名済み。
  4.5 に xhigh は無いので、旧ピン `grok-4.5-fast-xhigh` は改名前から無効だった。
  0037 の「4.5 据え置き」は GA 前のピンであり、後継が出たあとも残す理由が無い。
- 調査（2026-08-15）:
  - 公式の売りは長時間エージェントと指示追従。4.5 で止まった長い仕事向け。
  - 努力: low / medium / **high（named 既定）** / **xhigh（4.6 固有。4.5 に xhigh は無い）**。
  - Fast は Pro 以上の既定速度。Fast は約2倍価格。同一 Cursor Models 枠（4.5 / Composer 2.5 と同じプール）。
  - 標準単価は 4.5 と同じ（$2/$6）。Fast も Models & Pricing 正本では同額（$4/$12）。
    help/available-models だけ 4.5 Fast 出力を $18 と書いており資料が食い違う。
    価格差は差し替え理由に使わない。
  - 2026-08-12 から1週間は 4.6 の 50% 割引と含有枠2倍。08-19 以降は通常単価に戻る。
    親席の固定判断は割引期間のコスト感に依存しない。
  - 公開ベンチ（x.ai/news/grok-4-6）: AA Index 61（4.5 High は 56、Sol Max / Fable 5 Max と同帯）。
    CursorBench 3.2 は 69.9%（4.5 は 66.7%）。親席の根拠は「後継 GA + 長時間エージェント」であり、
    ベンチ単独ではゲート席を動かさない。
  - **スラッグの実測**（公開 docs は表示名「Cursor Grok 4.6」のみで Task ID を載せない）:
    - この Cloud Agent の Task allowlist に `cursor-grok-4.6-high-fast` がある。
    - 同日の敵対レビュー体2を `model: cursor-grok-4.6-high-fast` で起動し完走
      （run `bc-228a0045-cff9-512b-99f0-b2c0b8a4a1dc`）。
    - 親の `originalModelName` は `cursor-grok-4.6-xhigh-fast`（cursor-cloud run-info）。
    - Task リストに `cursor-grok-4.6-high`（非 Fast）と `cursor-grok-4.6-xhigh-fast` は無い。
  - Cursor の available-models ヘルプはまだ「flagship = Grok 4.5」、Router 必須も 4.5。
    Router プール（GPT-5.5 / Opus 5 / Grok 4.5 / Fable 5）に 4.6 は未掲載。
    ハーネス親は Router ではなく明示 Grok なので、ヘルプの遅れは差し替えを止めない。
  - **今は変えない席**:
    - Claude ゲート＝Opus 5（`claude-opus-5-thinking-high`）。価格表に Opus 6 は無い。
      Claude 4.6/4.7/4.8 は Hidden の旧 4.x 系であり、ゲート後継ではない。
    - 第3席は [[0046]] で `muse-spark-1.3-medium`。GPT-5.5 は Router 用。Sol / Luna / Terra は第3の代替ではない。
    - Fable 5 は天井判断のみ。約2倍コスト。ゲート代替禁止・Opus との trio 同居禁止は維持。
    - Composer 2.5 は親にしない（日常コーディング用。0033 の「親は Grok」と衝突）。
    - Auto/Router を親にしない（クロスファミリー検証の席が消える）。
- 決定:
  - **親チャット＝Grok 4.6**。criteria の `chat_orchestrator` と `grok_task` は
    Task 実在スラッグ `cursor-grok-4.6-high-fast` に揃える。
    xhigh は 4.6 の努力段として存在するが、Task allowlist に `cursor-grok-4.6-xhigh-fast` は無い。
    親 UI で xhigh を選ぶのは任意。criteria には書かない（Task に渡すと静かに落ちる）。
  - **実装の並列展開 / `review_trio` 第2席＝Grok 4.6**。
    `grok_task` と trio 第2も `cursor-grok-4.6-high-fast`。
  - **第1席 Opus 5 は据え置き。第3席は [[0046]] で Muse Spark 1.3 medium。**
  - **0031 / 0033 / 0037 は廃止しない。** 世代ピンだけ改正。`supersedes` に載せない。
  - **不変条件**: 親は常時 Grok。Claude は名前付き Task のみ。Muse は 3体多数決以外禁止（[[0046]]）。
    hooks から Task を物理起動しない。
  - **次世代の差し替え条件**: 新 Grok が GA し、Task スラッグが実在し（allowlist + 実起動）、
    長時間エージェント/指示追従で現行を上回る公式根拠があるときだけ、
    新 ADR + Feature（`proposed`）で世代を上げる。文書だけ先に書き換えない。
    Claude/Sol の世代上げも同じ条件（GA + Task スラッグ + 席の役割が変わらないこと）。
- 結果: 席骨格（誰が何をするか）は 0033 / 0037 のまま。Grok 世代ピンだけ 4.5 → 4.6。
- 関連: [[0031]] [[0033]] [[0037]] [[0039]]
