import { DateTime } from "luxon";
import * as R from "@remeda/remeda";
import { ok, Result, ResultAsync } from "neverthrow";
import { sql } from "kysely";
import {
  type CategorizedMemories,
  CreateMemoriesSchema,
  DeleteMemoriesSchema,
  EditMemoriesSchema,
  type LLMCreateMemory,
  type LLMEditMemory,
  type Memory,
  parseMemory,
} from "./schema.ts";
import { extractTag, stripTags } from "../../utils/string.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { AppConfig } from "../../services/config.ts";
import type { Database } from "../../services/database.ts";
import type { Logger } from "../../services/logger.ts";
import type { PluginConfig } from "../plugins/index.ts";

type MemoryDeps = { config: AppConfig; db: Database; log: Logger };

const getAllMemories = ({ db }: MemoryDeps) =>
(
  { includeDate = true, startDate = null }: { includeDate?: boolean; startDate?: string | null } =
    {},
) => {
  const datedQuery = () => {
    let query = db.selectFrom("memories")
      .selectAll()
      .where("date", "is not", null)
      .orderBy("date", "asc");

    if (startDate) {
      query = query
        .where("date", ">=", startDate)
        .where(sql`date(date)`, "<=", sql`date(${startDate}, '+7 days')`);
    }
    return query.execute();
  };

  const datelessQuery = () =>
    db.selectFrom("memories").selectAll().where("date", "is", null).execute();

  const fetchDated = includeDate
    ? ResultAsync.fromPromise(datedQuery(), dbError("Failed to fetch dated memories"))
    : ResultAsync.fromPromise(Promise.resolve([]), dbError("Failed to fetch dated memories"));

  return fetchDated
    .andThen((dated) =>
      ResultAsync.fromPromise(datelessQuery(), dbError("Failed to fetch dateless memories"))
        .map((dateless) => [...dated, ...dateless])
    )
    .andThen((rows) => Result.combine(rows.map(parseMemory)));
};

const getRelevantMemories = ({ db, config }: MemoryDeps) =>
(
  today?: DateTime,
): ResultAsync<CategorizedMemories, AppError> => {
  const t = today ?? DateTime.now().setZone(config.TIMEZONE).startOf("day");
  const todayStr = t.toFormat("yyyy-MM-dd");
  const weekAgoStr = t.minus({ days: 7 }).toFormat("yyyy-MM-dd");
  const weekAheadStr = t.plus({ days: 7 }).toFormat("yyyy-MM-dd");

  const datedQuery = () =>
    db.selectFrom("memories")
      .selectAll()
      .where("date", "is not", null)
      .where("date", ">=", weekAgoStr)
      .where("date", "<=", weekAheadStr)
      .orderBy("date", "asc")
      .execute();

  const datelessQuery = () =>
    db.selectFrom("memories").selectAll().where("date", "is", null).execute();

  return ResultAsync.combine([
    ResultAsync.fromPromise(datedQuery(), dbError("Failed to fetch dated memories")),
    ResultAsync.fromPromise(datelessQuery(), dbError("Failed to fetch dateless memories")),
  ])
    .andThen(([dated, dateless]) =>
      Result.combine([...dated.map(parseMemory), ...dateless.map(parseMemory)])
        .map((memories) => {
          const [datedParsed, general] = R.partition(memories, (m) => m.date !== null);
          const categorized = R.groupBy(datedParsed, (m) => {
            const dateStr = DateTime.fromJSDate(m.date!, { zone: "utc" }).toFormat("yyyy-MM-dd");
            if (dateStr === todayStr) return "today";
            return DateTime.fromJSDate(m.date!, { zone: "utc" }) < t ? "lastWeek" : "nextWeek";
          });
          return {
            today: categorized.today ?? [],
            lastWeek: categorized.lastWeek ?? [],
            nextWeek: categorized.nextWeek ?? [],
            general,
          };
        })
    );
};

const formatMemoriesForPrompt = (memories: Memory[]) => {
  if (R.isEmpty(memories)) {
    return "No stored memories are available.";
  }

  const [dated, undated] = R.partition(memories, (m) => m.date !== null);

  const formatDated = (m: Memory) =>
    `- ${DateTime.fromJSDate(m.date!, { zone: "utc" }).toFormat("yyyy-MM-dd")} - ${m.text}`;

  const formatUndated = (m: Memory) => `- ${m.text}`;

  return R.pipe(
    [
      R.isEmpty(dated) ? null : `Dated memories:\n${dated.map(formatDated).join("\n")}`,
      R.isEmpty(undated) ? null : `General memories:\n${undated.map(formatUndated).join("\n")}`,
    ],
    R.filter(R.isNonNullish),
    R.join("\n\n"),
  );
};

const formatCategorizedMemoriesForPrompt = (categorized: CategorizedMemories) => {
  const { today, lastWeek, nextWeek, general } = categorized;

  if ([today, lastWeek, nextWeek, general].every(R.isEmpty)) {
    return "No stored memories are available.";
  }

  const formatDated = (m: Memory) =>
    `- ${DateTime.fromJSDate(m.date!, { zone: "utc" }).toFormat("yyyy-MM-dd")} - ${m.text}`;

  const formatUndated = (m: Memory) => `- ${m.text}`;

  return R.pipe(
    [
      R.isEmpty(today) ? null : `Today:\n${today.map(formatDated).join("\n")}`,
      R.isEmpty(lastWeek) ? null : `Recent (past week):\n${lastWeek.map(formatDated).join("\n")}`,
      R.isEmpty(nextWeek) ? null : `Upcoming (next week):\n${nextWeek.map(formatDated).join("\n")}`,
      R.isEmpty(general) ? null : `General background:\n${general.map(formatUndated).join("\n")}`,
    ],
    R.filter(R.isNonNullish),
    R.join("\n\n"),
  );
};

export type MemoryMessageAnalysis = {
  memories: LLMCreateMemory[];
  editMemories: LLMEditMemory[];
  deleteMemories: string[];
  response: string;
};

const extractMemories = (
  messageText: string,
): Result<MemoryMessageAnalysis, never> => {
  const createJSON = extractTag("createMemories")(messageText ?? "");
  const editJSON = extractTag("editMemories")(messageText ?? "");
  const deleteJSON = extractTag("deleteMemories")(messageText ?? "");

  const toCreate = createJSON ? CreateMemoriesSchema.safeParse(createJSON) : null;
  const toEdit = editJSON ? EditMemoriesSchema.safeParse(editJSON) : null;
  const toDelete = deleteJSON ? DeleteMemoriesSchema.safeParse(deleteJSON) : null;

  const response = stripTags(["createMemories", "editMemories", "deleteMemories"])(messageText)
    .replace(/\n{3,}/g, "\n\n");

  return ok({
    memories: toCreate?.success ? toCreate.data : [],
    editMemories: toEdit?.success ? toEdit.data : [],
    deleteMemories: toDelete?.success ? toDelete.data : [],
    response,
  });
};

const updateMemories = ({ db, log }: MemoryDeps) =>
(
  analysis: MemoryMessageAnalysis,
  pluginConfig?: PluginConfig,
): ResultAsync<void, AppError> =>
  ResultAsync.fromPromise(
    (async () => {
      const toRow = (m: LLMCreateMemory) => ({
        date: m.date ?? null,
        text: m.text,
        source: pluginConfig?.pluginName ?? null,
        sourcePluginId: pluginConfig?.id ?? null,
        externalId: m.externalId ?? null,
        original: m.original ?? null,
      });

      const [withExtId, withoutExtId] = R.partition(
        analysis.memories,
        (m) => !!m.externalId,
      );

      if (!R.isEmpty(withExtId)) {
        await db
          .insertInto("memories")
          .values(withExtId.map(toRow))
          .onConflict((oc) =>
            oc.columns(["source", "externalId"])
              .where("externalId", "is not", null)
              .doUpdateSet({
                date: sql`excluded.date`,
                text: sql`excluded.text`,
                original: sql`excluded.original`,
              })
          )
          .execute();
      }

      if (!R.isEmpty(withoutExtId)) {
        await db
          .insertInto("memories")
          .values(withoutExtId.map(toRow))
          // NOTE: to avoid duplicates, this will silently ignore conflicts
          .onConflict((oc) => oc.columns(["source", "date", "text"]).doNothing())
          .execute();
      }

      if (!R.isEmpty(analysis.memories)) {
        log.info(`Upserted ${analysis.memories.length} memories`, { memories: analysis.memories });
      }

      for (const memory of analysis.editMemories) {
        const id = parseInt(memory.id, 10);
        if (isNaN(id)) {
          continue;
        }

        let query = db.updateTable("memories").where("id", "=", id);
        if (memory.text !== undefined) {
          query = query.set("text", memory.text);
        }
        if (memory.date !== undefined) {
          query = query.set("date", memory.date);
        }
        await query.execute();
      }
      if (!R.isEmpty(analysis.editMemories)) {
        log.info(`Edited ${analysis.editMemories.length} memories`, {
          editMemories: analysis.editMemories,
        });
      }

      if (!R.isEmpty(analysis.deleteMemories)) {
        const ids = analysis.deleteMemories.map((id) => parseInt(id, 10)).filter((id) =>
          !isNaN(id)
        );
        if (!R.isEmpty(ids)) {
          await db.deleteFrom("memories").where("id", "in", ids).execute();
          log.info(`Deleted ${ids.length} memories`, { ids });
        }
      }
    })(),
    dbError("Failed to update memories"),
  );

type RemoveStaleOpts = {
  dateRange?: { start: string; end: string };
};

const removeStaleMemories = ({ db, log }: MemoryDeps) =>
(
  source: string,
  currentExternalIds: string[],
  opts?: RemoveStaleOpts,
): ResultAsync<void, AppError> => {
  let query = db.deleteFrom("memories")
    .where("source", "=", source)
    .where("externalId", "is not", null);

  if (currentExternalIds.length > 0) {
    query = query.where("externalId", "not in", currentExternalIds);
  }

  if (opts?.dateRange) {
    query = query
      .where("date", ">=", opts.dateRange.start)
      .where("date", "<=", opts.dateRange.end);
  }

  return ResultAsync.fromPromise(
    query.executeTakeFirst().then((result) => {
      const count = Number(result.numDeletedRows);
      if (count > 0) {
        log.info`Removed ${count} stale memories for ${source}`;
      }
    }),
    dbError("Failed to remove stale memories"),
  );
};

export const makeMemoryDomain = (deps: MemoryDeps) => ({
  getAllMemories: getAllMemories(deps),
  getRelevantMemories: getRelevantMemories(deps),
  updateMemories: updateMemories(deps),
  removeStaleMemories: removeStaleMemories(deps),
  extractMemories,
  formatMemoriesForPrompt,
  formatCategorizedMemoriesForPrompt,
});

export { extractMemories };
export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
