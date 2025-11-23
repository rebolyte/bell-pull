import { DateTime } from "https://esm.sh/luxon@3.4.4";
import type { Context } from "../../types/index.ts";

/**
 * Retrieves all memories from the database
 * @param includeDate Whether to include date-specific memories or not
 * @param startDate Optional start date to filter memories from (ISO format)
 * @returns Array of memory objects
 */
export async function getAllMemories(includeDate = true, startDate = null) {
  try {
    const { sqlite } = await import("https://esm.town/v/stevekrouse/sqlite");

    // Get memories with dates if requested
    let memories = [];
    if (includeDate) {
      const query = startDate
        ? {
          sql:
            `SELECT id, date(date) as date, text FROM memories WHERE date >= :startDate AND date <= date(:startDate, '+7 days') ORDER BY date ASC`,
          args: { startDate },
        }
        : `SELECT id, date(date) as date, text FROM memories WHERE date IS NOT NULL ORDER BY date ASC`;

      const dateMemories = await sqlite.execute(query);
      memories = [...dateMemories.rows];
    }

    // Always get dateless memories
    const datelessMemories = await sqlite.execute(
      `SELECT id, date, text FROM memories WHERE date IS NULL`,
    );

    return [...memories, ...datelessMemories.rows];
  } catch (error) {
    console.error("Error retrieving memories:", error);
    return [];
  }
}

/**
 * Gets memories relevant to today and future dates
 * @returns Array of memory objects
 */
export async function getRelevantMemories() {
  try {
    // Get today's date in US Eastern Time
    const today = DateTime.now().setZone("America/New_York").startOf("day");
    const todayFormatted = today.toFormat("yyyy-MM-dd");

    return await getAllMemories(true, todayFormatted);
  } catch (error) {
    console.error("Error getting relevant memories:", error);
    return [];
  }
}

/**
 * Formats memories into a string for the system prompt
 * @param memories Array of memory objects
 * @returns Formatted string of memories
 */
export function formatMemoriesForPrompt(memories) {
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
}

export const makeMemoryDomain = (ctx: Context) => ({
  getAllMemories: getAllMemories(ctx),
  getRelevantMemories: getRelevantMemories(ctx),
  formatMemoriesForPrompt: formatMemoriesForPrompt(ctx),
});

export type MemoryDomain = ReturnType<typeof makeMemoryDomain>;
