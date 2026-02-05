// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("plugin_configs")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("plugin_name", "text", (col) => col.unique().notNull())
    .addColumn(
      "config",
      "text",
      (col) => col.notNull().defaultTo("{}").check(sql`json_valid(config)`),
    )
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("last_modified", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await sql`
    CREATE TRIGGER IF NOT EXISTS plugin_configs_last_modified
    AFTER UPDATE ON plugin_configs
    BEGIN
      UPDATE plugin_configs SET last_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `.execute(db);

  await db.insertInto("plugin_configs")
    .values({ plugin_name: "telegram", enabled: 1 })
    .onConflict((oc) => oc.column("plugin_name").doNothing())
    .execute();

  await db.schema.alterTable("memories")
    .addColumn("tags", "text", (col) => col.check(sql`json_valid(tags)`)).execute();
  await db.schema.alterTable("memories")
    .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`)).execute();
  await db.schema.alterTable("memories")
    .addColumn("last_modified", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`)).execute();
  await db.schema.alterTable("memories").addColumn("source", "text").execute();
  await db.schema.alterTable("memories").addColumn("source_plugin_id", "integer").execute();

  await db.schema
    .createIndex("idx_memories_source_date_text")
    .ifNotExists()
    .on("memories")
    .columns(["source", "date", "text"])
    .unique()
    .execute();

  await db.schema.alterTable("messages")
    .addColumn("last_modified", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`)).execute();
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_last_modified
    AFTER UPDATE ON messages
    BEGIN
      UPDATE messages SET last_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS messages_last_modified`.execute(db);
  await sql`DROP TRIGGER IF EXISTS memories_last_modified`.execute(db);
  await sql`DROP TRIGGER IF EXISTS plugin_configs_last_modified`.execute(db);

  await db.schema.alterTable("messages").dropColumn("last_modified").execute();
  await db.schema.dropIndex("idx_memories_source_date_text").execute();
  await db.schema.alterTable("memories").dropColumn("source_plugin_id").execute();
  await db.schema.alterTable("memories").dropColumn("last_modified").execute();
  await db.schema.alterTable("memories").dropColumn("created_at").execute();
  await db.schema.alterTable("memories").dropColumn("tags").execute();
  await db.schema.alterTable("memories").dropColumn("source").execute();

  await db.schema.dropTable("plugin_configs").execute();
}
