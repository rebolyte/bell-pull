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
      .addColumn("description", "text")
      .addColumn("source", "text", (col) => col.notNull())
      .addColumn("source_plugin_id", "integer")
      .addColumn("created_at", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
      .addColumn("last_modified", "text", (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
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

    await sql`
      CREATE TRIGGER IF NOT EXISTS metrics_last_modified
      AFTER UPDATE ON metrics
      BEGIN
        UPDATE metrics SET last_modified = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END
    `.execute(trx);

    await sql`
      CREATE TRIGGER IF NOT EXISTS archive_metrics_on_delete
      BEFORE DELETE ON metrics
      FOR EACH ROW
      BEGIN
        INSERT INTO archive (table_name, record_id, data)
        VALUES (
          'metrics',
          CAST(OLD.id AS TEXT),
          json_object(
            'id', OLD.id,
            'date', OLD.date,
            'metric', OLD.metric,
            'value', OLD.value,
            'unit', OLD.unit,
            'description', OLD.description,
            'source', OLD.source,
            'source_plugin_id', OLD.source_plugin_id,
            'created_at', OLD.created_at,
            'last_modified', OLD.last_modified
          )
        );
      END
    `.execute(trx);
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`DROP TRIGGER IF EXISTS archive_metrics_on_delete`.execute(trx);
    await sql`DROP TRIGGER IF EXISTS metrics_last_modified`.execute(trx);
    await trx.schema.dropTable("metrics").execute();
  });
}
