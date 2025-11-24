// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

// It's important to use Kysely<any> and not Kysely<YourDatabase>.
// Migrations should never depend on the current code of your app
// because they need to work even when the app changes. Migrations
// need to be "frozen in time".
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("memories")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("date", "text")
    .addColumn("text", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("messages")
    .ifNotExists()
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("chat_id", "text", (col) => col.notNull())
    .addColumn("sender_id", "text", (col) => col.notNull())
    .addColumn("sender_name", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("is_bot", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();

  await db.schema
    .createIndex("idx_messages_chat_id")
    .on("messages")
    .column("chat_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("messages").execute();
  await db.schema.dropTable("memories").execute();
}
