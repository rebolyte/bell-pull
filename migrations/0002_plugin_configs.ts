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

  // SQLite doesn't support ALTER TABLE ADD COLUMN with non-constant defaults
  // (like CURRENT_TIMESTAMP). The only way to add columns with such defaults
  // is to rebuild the table: create new table, copy data, drop old, rename.
  await rebuildMemoriesTable(db);
  await rebuildMessagesTable(db);

  await db.schema
    .createIndex("idx_memories_source_date_text")
    .ifNotExists()
    .on("memories")
    .columns(["source", "date", "text"])
    .unique()
    .execute();

  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_last_modified
    AFTER UPDATE ON messages
    BEGIN
      UPDATE messages SET last_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END
  `.execute(db);
}

async function rebuildMemoriesTable(db: Kysely<any>): Promise<void> {
  const info = await sql<{ name: string; dflt_value: string | null }>`
    SELECT name, dflt_value FROM pragma_table_info('memories') WHERE name = 'created_at'
  `.execute(db);
  if (info.rows.length > 0 && info.rows[0].dflt_value === "CURRENT_TIMESTAMP") {
    return;
  }

  const cols = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info('memories')
  `.execute(db);
  const existingCols = cols.rows.map((r) => r.name);

  await sql`DROP TABLE IF EXISTS memories_new`.execute(db);

  await db.schema
    .createTable("memories_new")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("date", "text")
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("tags", "text", (col) => col.check(sql`json_valid(tags)`))
    .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("last_modified", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("source", "text")
    .addColumn("source_plugin_id", "integer")
    .execute();

  const newCols = [
    "id",
    "date",
    "text",
    "tags",
    "created_at",
    "last_modified",
    "source",
    "source_plugin_id",
  ];
  const selectExprs = newCols.map((c) => {
    if (!existingCols.includes(c)) {
      return c === "created_at" || c === "last_modified" ? "CURRENT_TIMESTAMP" : "NULL";
    }
    return c === "created_at" || c === "last_modified" ? `COALESCE(${c}, CURRENT_TIMESTAMP)` : c;
  });

  await sql
    .raw(
      `INSERT INTO memories_new (${newCols.join(", ")}) SELECT ${selectExprs.join(", ")} FROM memories`,
    )
    .execute(db);

  await sql`DROP TABLE memories`.execute(db);
  await sql`ALTER TABLE memories_new RENAME TO memories`.execute(db);
}

async function rebuildMessagesTable(db: Kysely<any>): Promise<void> {
  const info = await sql<{ name: string; dflt_value: string | null }>`
    SELECT name, dflt_value FROM pragma_table_info('messages') WHERE name = 'last_modified'
  `.execute(db);
  if (info.rows.length > 0 && info.rows[0].dflt_value === "CURRENT_TIMESTAMP") {
    return;
  }

  const cols = await sql<{ name: string }>`
    SELECT name FROM pragma_table_info('messages')
  `.execute(db);
  const existingCols = cols.rows.map((r) => r.name);

  await sql`DROP TABLE IF EXISTS messages_new`.execute(db);

  await db.schema
    .createTable("messages_new")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("chat_id", "text", (col) => col.notNull())
    .addColumn("sender_id", "text", (col) => col.notNull())
    .addColumn("sender_name", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("is_bot", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("last_modified", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  const newCols = [
    "id",
    "chat_id",
    "sender_id",
    "sender_name",
    "message",
    "is_bot",
    "created_at",
    "last_modified",
  ];
  const selectExprs = newCols.map((c) => {
    if (!existingCols.includes(c)) {
      return c === "last_modified" ? "CURRENT_TIMESTAMP" : "NULL";
    }
    return c === "last_modified" ? `COALESCE(${c}, CURRENT_TIMESTAMP)` : c;
  });

  await sql
    .raw(
      `INSERT INTO messages_new (${newCols.join(", ")}) SELECT ${selectExprs.join(", ")} FROM messages`,
    )
    .execute(db);

  await sql`DROP TABLE messages`.execute(db);
  await sql`ALTER TABLE messages_new RENAME TO messages`.execute(db);

  await db.schema
    .createIndex("idx_messages_chat_id")
    .ifNotExists()
    .on("messages")
    .column("chat_id")
    .execute();
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
