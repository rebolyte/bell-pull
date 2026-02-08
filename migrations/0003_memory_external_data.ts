// deno-lint-ignore-file no-explicit-any

import { Kysely } from "kysely";
import { hasColumn } from "./helper.ts";

export async function up(db: Kysely<any>): Promise<void> {
  if (!await hasColumn(db, "memories", "external_id")) {
    await db.schema.alterTable("memories").addColumn("external_id", "text").execute();
  }
  if (!await hasColumn(db, "memories", "original")) {
    await db.schema.alterTable("memories").addColumn("original", "text").execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("memories").dropColumn("external_id").execute();
  await db.schema.alterTable("memories").dropColumn("original").execute();
}
