import type { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
export function inspectAudit(db: DatabaseSync, tenant: string) {
  const rows = db
    .prepare("SELECT * FROM events WHERE tenant=? ORDER BY seq")
    .all(tenant);
  let previous = "GENESIS";
  for (const e of rows) {
    const digest = createHash("sha256")
      .update(
        JSON.stringify([
          e.tenant,
          e.actor,
          e.action,
          e.detail,
          e.created,
          e.previous,
        ]),
      )
      .digest("hex");
    if (e.previous !== previous || e.digest !== digest)
      return {
        valid: false,
        checked: rows.length,
        brokenAt: Number(e.seq),
        head: null,
      };
    previous = String(e.digest);
  }
  return {
    valid: true,
    checked: rows.length,
    brokenAt: null,
    head: rows.length ? previous : null,
  };
}
