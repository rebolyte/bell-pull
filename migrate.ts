import { promises as fs } from "node:fs";
import * as path from "node:path";
import { FileMigrationProvider, Migrator } from "kysely";
import { parseArgs } from "@std/cli/parse-args";
import { createDatabase } from "./src/services/database.ts";
import { createConfig } from "./src/services/config.ts";

async function runMigration() {
  const config = createConfig();
  const db = createDatabase(config.DATABASE_PATH);

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      // This needs to be an absolute path.
      migrationFolder: path.join(Deno.cwd(), "migrations"),
    }),
  });

  const flags = parseArgs(Deno.args, {
    boolean: ["help"],
    string: ["direction"],
    alias: { h: "help", d: "direction" },
    default: { direction: "latest" },
  });

  if (flags.help) {
    console.log("Usage: deno run -A migrate.ts [direction]");
    console.log("Directions: latest (default), up, down");
    Deno.exit(0);
  }

  // Handle positional arg if flag not provided
  const direction = flags._[0] || flags.direction;

  let result;

  switch (direction) {
    case "up":
      console.log("Migrating up...");
      result = await migrator.migrateUp();
      break;
    case "down":
      console.log("Migrating down...");
      result = await migrator.migrateDown();
      break;
    case "latest":
      console.log("Migrating to latest...");
      result = await migrator.migrateToLatest();
      break;
    default:
      console.error(`Unknown direction: ${direction}`);
      Deno.exit(1);
  }

  const { error, results } = result;

  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was executed successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });

  if (error) {
    console.error("failed to migrate");
    console.error(error);
    Deno.exit(1);
  }

  await db.destroy();
}

runMigration();
