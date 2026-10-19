package packet.canon_test

import rego.v1

import data.packet.canon

ok_packet := {
	"schema": "harness-query/v1",
	"cycle": "C-0010",
	"node": "skill:verify",
	"seq": 1,
	"context_mode": "isolated",
	"feature": "F-0007",
	"diff_stat": "1 file",
	"metrics": null,
	"catalog_hits": [],
	"adr_paths": ["docs/decisions/0045-dispatch-context-packet.md"],
}

ok_dispatch := {
	"cycle": "C-0010",
	"node": "skill:verify",
	"seq": 1,
	"seat": "parent",
	"escalate": "stay",
	"sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	"context_mode": "isolated",
}

ok_input := {
	"packet": ok_packet,
	"packet_bytes": 200,
	"packet_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	"dispatch": ok_dispatch,
	"writer": "parent",
	"child_keys": [],
	"effort_allow": ["high"],
	"effort_default": "high",
	"canon_path_count": 0,
	"required_mode": "isolated",
	"expected_seats": ["parent"],
	"trio_third": false,
	"ceiling_replaces_gate": false,
	"role_swap_to_opus": false,
}

test_deny_empty_when_valid if {
	count(canon.deny) == 0 with input as ok_input
}

test_deny_forbidden_key if {
	p := object.union(ok_packet, {"learnings": "no"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet": p})
}

test_deny_oversize if {
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet_bytes": 32769})
}

test_deny_empty_bytes if {
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet_bytes": 0})
}

test_deny_bad_context_mode if {
	d := object.union(ok_dispatch, {"context_mode": "fork"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"dispatch": d})
}

test_deny_child_self_promote if {
	count(canon.deny) > 0 with input as object.union(ok_input, {"child_keys": ["effort"]})
}

test_deny_width1_effort_override if {
	d := object.union(ok_dispatch, {"effort": "high"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"dispatch": d, "effort_allow": ["high"]})
}

test_allow_width2_effort_override if {
	d := object.union(ok_dispatch, {"effort": "medium"})
	count(canon.deny) == 0 with input as object.union(ok_input, {
		"dispatch": d,
		"effort_allow": ["high", "medium"],
		"effort_default": "high",
	})
}

test_deny_effort_outside_allow if {
	d := object.union(ok_dispatch, {"effort": "low"})
	count(canon.deny) > 0 with input as object.union(ok_input, {
		"dispatch": d,
		"effort_allow": ["high", "medium"],
		"effort_default": "high",
	})
}

test_deny_missing_canon_path_count if {
	count(canon.deny) > 0 with input as object.remove(ok_input, {"canon_path_count"})
}

test_deny_negative_bytes if {
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet_bytes": -5})
}

test_deny_unknown_seat if {
	d := object.union(ok_dispatch, {"seat": "sol"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"dispatch": d})
}

test_deny_node_mismatch if {
	d := object.union(ok_dispatch, {"node": "skill:reflect"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"dispatch": d})
}

test_deny_sha_mismatch if {
	count(canon.deny) > 0 with input as object.union(ok_input, {
		"packet_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	})
}

test_deny_required_mode_mismatch if {
	count(canon.deny) > 0 with input as object.union(ok_input, {"required_mode": "packet"})
}

test_deny_stay_when_canon_paths if {
	d := object.union(ok_dispatch, {"escalate": "stay"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"dispatch": d, "canon_path_count": 1})
}

test_allow_trio_when_canon_paths if {
	d := object.union(ok_dispatch, {"escalate": "trio"})
	count(canon.deny) == 0 with input as object.union(ok_input, {"dispatch": d, "canon_path_count": 2})
}

test_deny_ceiling_replaces_gate if {
	d := object.union(ok_dispatch, {"escalate": "ceiling"})
	count(canon.deny) > 0 with input as object.union(ok_input, {
		"dispatch": d,
		"ceiling_replaces_gate": true,
	})
}

test_deny_model_family_seat if {
	d := object.union(ok_dispatch, {"seat": "grok"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"dispatch": d})
}

test_allow_review_seat if {
	d := object.union(ok_dispatch, {"node": "skill:adversarial-review", "seat": "review", "escalate": "trio"})
	p := object.union(ok_packet, {"node": "skill:adversarial-review"})
	count(canon.deny) == 0 with input as object.union(ok_input, {
		"packet": p,
		"dispatch": d,
		"canon_path_count": 1,
		"required_mode": "isolated",
		"expected_seats": ["review"],
	})
}

test_deny_empty_feature_only if {
	p := object.union(ok_packet, {"feature": "", "diff_stat": "", "catalog_hits": [], "adr_paths": [], "metrics": {}})
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet": p})
}

test_deny_whitespace_diff_stat if {
	p := object.union(ok_packet, {"feature": "", "diff_stat": " \n", "catalog_hits": [], "adr_paths": [], "metrics": {}})
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet": p})
}

test_deny_zwsp_diff_stat if {
	p := object.union(ok_packet, {"feature": "", "diff_stat": "\u200b", "catalog_hits": [], "adr_paths": [], "metrics": {}})
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet": p})
}

test_deny_bad_schema if {
	p := object.union(ok_packet, {"schema": "fork/v1"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet": p})
}

test_deny_packet_effort_key if {
	p := object.union(ok_packet, {"effort": "high"})
	count(canon.deny) > 0 with input as object.union(ok_input, {"packet": p})
}
