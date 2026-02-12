// deno-lint-ignore-file no-explicit-any

import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("metrics")
      .ifNotExists()
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("date", "text", (col) => col.notNull())
      .addColumn("metric", "text", (col) => col.notNull())
      .addColumn("value", "real", (col) => col.notNull())
      .addColumn("unit", "text")
      .addColumn("source", "text", (col) => col.notNull())
      .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
      .execute();

    await trx.schema
      .createIndex("idx_metrics_date_metric_source")
      .ifNotExists()
      .on("metrics")
      .columns(["date", "metric", "source"])
      .unique()
      .execute();

    await trx.schema
      .createIndex("idx_metrics_metric_date")
      .ifNotExists()
      .on("metrics")
      .columns(["metric", "date"])
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("metrics").execute();
}
