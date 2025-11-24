import { DateTime } from "https://esm.sh/luxon@3.4.4";
import type { Context, Reader } from "../../types/index.ts";
import { type Selectable, sql } from "kysely";
import type { MemoriesTable } from "../../services/database.ts";

type Memory = Selectable<MemoriesTable>;

/**
 * Retrieves all memories from the database
 */
const getAllMemories: Reader<
  "db",
  { includeDate?: boolean; startDate?: string | null },
  Promise<Memory[]>
> = ({ db }) => async ({ includeDate = true, startDate = null } = {}) => {
  try {
    let memories: Memory[] = [];

    if (includeDate) {
      let query = db.selectFrom("memories")
        .selectAll()
        .where("date", "is not", null)
        .orderBy("date", "asc");

      if (startDate) {
        query = query
          .where("date", ">=", startDate)
          // SQLite doesn't have date add function in standard SQL, so using raw sql or just filtering in JS
          // But kysely helper sql`date(...)` might work if using sqlite dialect
          .where(sql`date(date)`, "<=", sql`date(${startDate}, '+7 days')`);
      }

      memories = await query.execute();
    }

    const datelessMemories = await db.selectFrom("memories")
      .selectAll()
      .where("date", "is", null)
      .execute();

    return [...memories, ...datelessMemories];
  } catch (error) {
    console.error("Error retrieving memories:", error);
    return []; // Return empty if table doesn't exist or other error
  }
};

/**
 * Gets memories relevant to today and future dates
 */
const getRelevantMemories: Reader<
  "db",
  void,
  Promise<Memory[]>
> = (deps) => async () => {
  try {
    // Get today's date in US Eastern Time
    const today = DateTime.now().setZone("America/New_York").startOf("day");
    const todayFormatted = today.toFormat("yyyy-MM-dd");

    // reusing the reader by passing deps manually?
    // Or just calling the implementation?
    // For simplicity, I'll just use the implementation returned by the reader
    return await getAllMemories(deps)({ includeDate: true, startDate: todayFormatted });
  } catch (error) {
    console.error("Error getting relevant memories:", error);
    return [];
  }
};

/**
 * Formats memories into a string for the system prompt
 */
const formatMemoriesForPrompt = (memories: Memory[]) => {
  if (!memories || memories.length === 0) {
    return "No stored memories are available.";
  }

  // Format dated memories
  const datedMemories = memories
    .filter((memory) => memory.date)
    .map((memory) => {
      const date = DateTime.fromISO(memory.date);
      return `- ${date.toFormat("yyyy-MM-dd")} [ID: ${memory.id}]: ${memory.text}`;
    });

  // Format dateless memories
  const datelessMemories = memories
    .filter((memory) => !memory.date)
    .map((memory) => `- [ID: ${memory.id}]: ${memory.text}`);

  let result = "";

  if (datedMemories.length > 0) {
    result += "Dated memories:\n" + datedMemories.join("\n") + "\n\n";
  }

  if (datelessMemories.length > 0) {
    result += "General memories:\n" + datelessMemories.join("\n");
  }

  return result;
};

export const makeMemoryDomain = (ctx: Context) => ({
  getAllMemories: getAllMemories(ctx),
  getRelevantMemories: getRelevantMemories(ctx),
  formatMemoriesForPrompt, // This is a pure function, doesn't need ctx
});

export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
