// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`
      CREATE TRIGGER IF NOT EXISTS memories_last_modified
      AFTER UPDATE ON memories
      BEGIN
        UPDATE memories SET last_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `.execute(trx);

    await trx.schema
      .createTable("cron_log")
      .ifNotExists()
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("job_name", "text", (col) => col.notNull())
      .addColumn("state", "integer", (col) => col.notNull())
      .addColumn("result", "text", (col) => col.check(sql`result IS NULL OR json_valid(result)`))
      .addColumn("error", "text")
      .addColumn("duration_ms", "integer")
      .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await trx.schema
      .createIndex("idx_cron_log_job_name_created")
      .ifNotExists()
      .on("cron_log")
      .columns(["job_name", "created_at"])
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema.dropTable("cron_log").execute();
    await sql`DROP TRIGGER IF EXISTS memories_last_modified`.execute(trx);
  });
}
