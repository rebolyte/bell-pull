// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";
import { hasColumn } from "./helper.ts";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    if (!await hasColumn(trx, "memories", "external_id")) {
      await trx.schema.alterTable("memories").addColumn("external_id", "text").execute();
    }
    if (!await hasColumn(trx, "memories", "original")) {
      await trx.schema.alterTable("memories").addColumn("original", "text").execute();
    }

    await sql`DROP INDEX IF EXISTS idx_memories_source_date_text`.execute(trx);
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_source_date_text
      ON memories(source, date, text)
      WHERE external_id IS NULL
    `.execute(trx);

    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_source_external_id
      ON memories(source, external_id)
      WHERE external_id IS NOT NULL
    `.execute(trx);

    await trx.schema
      .createTable("archive")
      .ifNotExists()
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("table_name", "text", (col) => col.notNull())
      .addColumn("record_id", "text", (col) => col.notNull())
      .addColumn("data", "text", (col) => col.notNull().check(sql`json_valid(data)`))
      .addColumn("archived_at", "text", (col) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn("caused_by_table", "text")
      .addColumn("caused_by_id", "text")
      .execute();

    await trx.schema
      .createIndex("idx_archive_table_record")
      .ifNotExists()
      .on("archive")
      .columns(["table_name", "record_id"])
      .execute();

    await trx.schema
      .createIndex("idx_archive_archived_at")
      .ifNotExists()
      .on("archive")
      .column("archived_at")
      .execute();

    await sql`
      CREATE TRIGGER IF NOT EXISTS archive_memories_on_delete
      BEFORE DELETE ON memories
      FOR EACH ROW
      BEGIN
        INSERT INTO archive (table_name, record_id, data)
        VALUES (
          'memories',
          CAST(OLD.id AS TEXT),
          json_object(
            'id', OLD.id,
            'date', OLD.date,
            'text', OLD.text,
            'source', OLD.source,
            'tags', OLD.tags,
            'created_at', OLD.created_at,
            'last_modified', OLD.last_modified,
            'source_plugin_id', OLD.source_plugin_id,
            'external_id', OLD.external_id,
            'original', OLD.original
          )
        );
      END
    `.execute(trx);
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`DROP TRIGGER IF EXISTS archive_memories_on_delete`.execute(trx);
    await sql`DROP INDEX IF EXISTS idx_memories_source_external_id`.execute(trx);
    await sql`DROP INDEX IF EXISTS idx_memories_source_date_text`.execute(trx);
    await sql`
      CREATE UNIQUE INDEX idx_memories_source_date_text
      ON memories(source, date, text)
    `.execute(trx);
    await trx.schema.dropTable("archive").ifExists().execute();
    await trx.schema.alterTable("memories").dropColumn("external_id").execute();
    await trx.schema.alterTable("memories").dropColumn("original").execute();
  });
}
