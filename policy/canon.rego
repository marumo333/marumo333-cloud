package harness.canon

import rego.v1

# ハーネスの正本パス。差分がここを含むと stay を拒否する。被覆率にはしない。
# プロダクト（features/ src/ app/）は product_path。feature-gate が振る舞いと型を見る。

canon_path(p) if startswith(p, ".claude/skills/")

canon_path(p) if startswith(p, ".claude/agents/")

canon_path(p) if startswith(p, ".claude/hooks/")

canon_path(p) if p == ".cursor/hooks.json"

canon_path(p) if startswith(p, ".cursor/hooks/")

# events.jsonl は追記ログ（状態）。正本は必須集合と席のピンだけ。
canon_path(p) if p == "cycle/required-cycle.json"

canon_path(p) if p == "cycle/model-routing.yaml"

canon_path(p) if p == "cycle/code-quality.yaml"

canon_path(p) if p == ".claude/AGENTS.md"

canon_path(p) if p == ".claude/settings.json"

canon_path(p) if startswith(p, "docs/decisions/")

canon_path(p) if startswith(p, "policy/")

canon_path(p) if startswith(p, "scripts/")

canon_path(p) if p == "package.json"

canon_path(p) if p == "pnpm-lock.yaml"

canon_path(p) if p == "README.md"

canon_path(p) if p == "TEMPLATE.md"

canon_path(p) if startswith(p, ".github/workflows/")

paths contains p if {
	some p in input.diff_paths
	canon_path(p)
}

product_path(p) if startswith(p, "features/")

product_path(p) if startswith(p, "src/")

product_path(p) if startswith(p, "app/")

product_paths contains p if {
	some p in input.diff_paths
	product_path(p)
}
