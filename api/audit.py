from datetime import datetime, timezone


def write_audit_log(supabase, actor, action, table_name, record_id=None, before=None, after=None):
    """Best-effort audit logging.

    The audit table is created by supabase/access_control_policies.sql. Until that
    migration is applied, writes should not break the user-facing action.
    """
    try:
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor.get("id"),
                "actor_role": actor.get("role"),
                "action": action,
                "table_name": table_name,
                "record_id": record_id,
                "before_snapshot": before or {},
                "after_snapshot": after or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception:
        return
