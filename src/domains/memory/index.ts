import { DateTime } from "luxon";
import * as R from "@remeda/remeda";
import { ok, Result, ResultAsync } from "neverthrow";
import { sql } from "kysely";
import {
  CreateMemoriesSchema,
  DeleteMemoriesSchema,
  EditMemoriesSchema,
  type LLMCreateMemory,
  type LLMEditMemory,
  type Memory,
  parseMemory,
} from "./schema.ts";
import { extractTag, stripTags } from "../../utils/validate.ts";
import { type AppError, dbError } from "../../errors.ts";
import type { Database } from "../../services/database.ts";

type MemoryDeps = { db: Database };

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

const getRelevantMemories = (deps: MemoryDeps) => () => {
  const today = DateTime.now().setZone("America/New_York").startOf("day");
  const todayFormatted = today.toFormat("yyyy-MM-dd");
  return getAllMemories(deps)({ includeDate: true, startDate: todayFormatted });
};

const formatMemoriesForPrompt = (memories: Memory[]) => {
  if (R.isEmpty(memories)) {
    return "No stored memories are available.";
  }

  const [dated, undated] = R.partition(memories, (m) => m.date !== null);

  const formatDated = (m: Memory) =>
    `- ${DateTime.fromJSDate(m.date!).toFormat("yyyy-MM-dd")} [ID: ${m.id}]: ${m.text}`;

  const formatUndated = (m: Memory) => `- [ID: ${m.id}]: ${m.text}`;

  return R.pipe(
    [
      R.isEmpty(dated) ? null : `Dated memories:\n${dated.map(formatDated).join("\n")}`,
      R.isEmpty(undated) ? null : `General memories:\n${undated.map(formatUndated).join("\n")}`,
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

const updateMemories = ({ db }: MemoryDeps) =>
(
  analysis: MemoryMessageAnalysis,
): ResultAsync<void, AppError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!R.isEmpty(analysis.memories)) {
        await db
          .insertInto("memories")
          .values(analysis.memories.map((m) => ({ date: m.date ?? null, text: m.text })))
          .execute();
        console.log(`Created ${analysis.memories.length} memories`);
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
        console.log(`Edited ${analysis.editMemories.length} memories`);
      }

      if (!R.isEmpty(analysis.deleteMemories)) {
        const ids = analysis.deleteMemories.map((id) => parseInt(id, 10)).filter((id) =>
          !isNaN(id)
        );
        if (!R.isEmpty(ids)) {
          await db.deleteFrom("memories").where("id", "in", ids).execute();
          console.log(`Deleted ${ids.length} memories`);
        }
      }
    })(),
    dbError("Failed to update memories"),
  );

export const makeMemoryDomain = (deps: MemoryDeps) => ({
  getAllMemories: getAllMemories(deps),
  getRelevantMemories: getRelevantMemories(deps),
  updateMemories: updateMemories(deps),
  extractMemories,
  formatMemoriesForPrompt,
});

export { extractMemories };
export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
