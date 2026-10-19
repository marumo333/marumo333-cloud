package packet.canon

import rego.v1

# deny 集合が空だけを見る。allow 完全ルールは置かない。

forbidden_keys := {"learnings", "conversation", "decisions", "session", "effort", "escalate", "seat"}

modes := {"isolated", "packet"}

escalates := {"stay", "trio", "ceiling", "human"}

seats := {"parent", "implement", "plan", "review"}

has_schema if input.packet.schema == "harness-query/v1"

has_cycle if regex.match(`^C-[0-9]{4}$`, input.packet.cycle)

has_packet_node if is_string(input.packet.node)

has_packet_seq if is_number(input.packet.seq)

has_bytes if is_number(input.packet_bytes)

has_expected_seats if {
	is_array(input.expected_seats)
	count(input.expected_seats) > 0
}

seat_ok if input.dispatch.seat in input.expected_seats

empty_text(s) if regex.match(`^[\p{Z}\p{C}]*$`, s)

has_facts if {
	is_string(input.packet.feature)
	not empty_text(input.packet.feature)
}

has_facts if {
	is_string(input.packet.diff_stat)
	not empty_text(input.packet.diff_stat)
}

has_catalog_hit if {
	some h in input.packet.catalog_hits
	is_string(h.id)
	not empty_text(h.id)
	is_string(h.path)
	not empty_text(h.path)
}

has_facts if has_catalog_hit

has_adr if {
	some p in input.packet.adr_paths
	is_string(p)
	not empty_text(p)
}

has_facts if has_adr

has_metric if {
	some k
	v := input.packet.metrics[k]
	v != null
	not empty_text(sprintf("%v", [v]))
}

has_facts if has_metric

has_sha if regex.match(`^[a-f0-9]{64}$`, input.dispatch.sha256)

has_packet_sha if regex.match(`^[a-f0-9]{64}$`, input.packet_sha256)

has_mode if input.dispatch.context_mode in modes

has_packet_mode if input.packet.context_mode in modes

has_required_mode if input.required_mode in modes

has_escalate if input.dispatch.escalate in escalates

has_seat if input.dispatch.seat in seats

has_child_keys if is_array(input.child_keys)

has_effort_allow if {
	is_array(input.effort_allow)
	count(input.effort_allow) > 0
}

has_canon_count if is_number(input.canon_path_count)

effort_present if input.dispatch.effort

effort_ok if input.dispatch.effort in input.effort_allow

walk_forbidden if {
	some path, value
	walk(input.packet, [path, value])
	count(path) > 0
	path[count(path) - 1] in forbidden_keys
}

deny contains "schema は harness-query/v1" if not has_schema

deny contains "cycle は C-NNNN" if not has_cycle

deny contains "packet.node が必要" if not has_packet_node

deny contains "packet.seq が必要" if not has_packet_seq

deny contains "禁則キー" if walk_forbidden

deny contains "事実の無い空パケット" if not has_facts

deny contains "packet_bytes が必要" if not has_bytes

deny contains "packet_bytes は 0 以上" if {
	has_bytes
	input.packet_bytes < 0
}

deny contains "packet_bytes 上限" if {
	has_bytes
	input.packet_bytes > 32768
}

deny contains "空パケット" if {
	has_bytes
	input.packet_bytes == 0
}

deny contains "context_mode は isolated か packet" if not has_mode

deny contains "packet の context_mode は isolated か packet" if not has_packet_mode

deny contains "required_mode は isolated か packet" if not has_required_mode

deny contains "escalate が不正" if not has_escalate

deny contains "seat が不正" if not has_seat

deny contains "expected_seats が必要" if not has_expected_seats

deny contains "席が dispatch_seats の外" if {
	has_seat
	has_expected_seats
	not seat_ok
}

deny contains "child_keys が必要" if not has_child_keys

deny contains "effort_allow が必要" if not has_effort_allow

deny contains "canon_path_count が必要" if not has_canon_count

deny contains "sha256 が必要" if not has_sha

deny contains "packet_sha256 が必要" if not has_packet_sha

deny contains "sha256 不一致" if {
	has_sha
	has_packet_sha
	input.dispatch.sha256 != input.packet_sha256
}

deny contains "node 不一致" if input.packet.node != input.dispatch.node

deny contains "seq 不一致" if input.packet.seq != input.dispatch.seq

deny contains "cycle 不一致" if input.packet.cycle != input.dispatch.cycle

deny contains "context_mode 不一致" if input.packet.context_mode != input.dispatch.context_mode

deny contains "required_mode 不一致" if input.required_mode != input.dispatch.context_mode

child_promotes if {
	has_child_keys
	"effort" in input.child_keys
}

child_promotes if {
	has_child_keys
	"escalate" in input.child_keys
}

child_promotes if {
	has_child_keys
	"seat" in input.child_keys
}

deny contains "子の自己昇格" if child_promotes

deny contains "幅1の effort 上書きは拒否" if {
	effort_present
	has_effort_allow
	count(input.effort_allow) < 2
}

deny contains "effort が許容幅の外" if {
	effort_present
	has_effort_allow
	not effort_ok
}

deny contains "canon 差分がある周で stay は拒否" if {
	has_canon_count
	input.dispatch.escalate == "stay"
	input.canon_path_count > 0
}

deny contains "ceiling は verifier / reflector の代替ではない" if input.ceiling_replaces_gate == true
