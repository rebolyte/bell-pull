// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TRIGGER IF NOT EXISTS memories_last_modified
    AFTER UPDATE ON memories
    BEGIN
      UPDATE memories SET last_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS memories_last_modified`.execute(db);
}
