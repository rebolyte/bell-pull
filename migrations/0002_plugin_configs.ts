// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("plugin_configs")
    .ifNotExists()
    .addColumn("plugin_name", "text", (col) => col.primaryKey())
    .addColumn("config", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("updated_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("plugin_configs").execute();
}
