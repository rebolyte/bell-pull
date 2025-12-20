import { afterAll, beforeAll, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { useHarness } from "../../utils/harness.ts";
import { makeMemoryDomain, MemoryDomain } from "./index.ts";
import { DateTime } from "https://esm.sh/luxon@3.4.4";
import type { Database } from "../../services/database.ts";

describe("Memory Domain", () => {
  describe("formatMemoriesForPrompt", () => {
    it("should format dated and undated memories correctly", () => {
      const { formatMemoriesForPrompt } = makeMemoryDomain({ db: {} as Database });

      const memories = [
        { id: 1, text: "Dated memory", date: new Date("2023-10-27T00:00:00.000Z") },
        { id: 2, text: "Undated memory", date: null },
      ];

      const result = formatMemoriesForPrompt(memories);

      expect(result).toContain("Dated memories:");
      expect(result).toContain("2023-10-27 [ID: 1]: Dated memory");
      expect(result).toContain("General memories:");
      expect(result).toContain("[ID: 2]: Undated memory");
    });

    it("should return fallback message when no memories", () => {
      const { formatMemoriesForPrompt } = makeMemoryDomain({ db: {} as Database });
      expect(formatMemoriesForPrompt([])).toBe("No stored memories are available.");
    });
  });

  describe("database operations", () => {
    const harness = useHarness();
    let memoryDomain: MemoryDomain;

    beforeAll(async () => {
      await harness.setup();
    });

    beforeEach(async () => {
      await harness.reset();
      memoryDomain = makeMemoryDomain({ db: harness.db });
    });

    afterAll(async () => {
      await harness.teardown();
    });

    describe("getAllMemories", () => {
      it("should return dated memories within range and all undated", async () => {
        await harness.db.insertInto("memories").values([
          { text: "Old memory", date: "2023-01-01" },
          { text: "Future memory", date: "2023-12-31" },
          { text: "Undated", date: null },
        ]).execute();

        const result = await memoryDomain.getAllMemories({
          includeDate: true,
          startDate: "2023-01-01",
        });
        const memories = result._unsafeUnwrap();
        const texts = memories.map((m) => m.text);

        expect(texts.join(",")).toContain("Old memory");
        expect(texts.join(",")).toContain("Undated");
        expect(texts.includes("Future memory")).toBe(false);
      });
    });

    describe("getRelevantMemories", () => {
      it("should return memories for current week plus undated", async () => {
        const today = DateTime.now().setZone("America/New_York").startOf("day");
        const todayStr = today.toFormat("yyyy-MM-dd");
        const tomorrowStr = today.plus({ days: 1 }).toFormat("yyyy-MM-dd");

        await harness.db.insertInto("memories").values([
          { text: "Today memory", date: todayStr },
          { text: "Tomorrow memory", date: tomorrowStr },
          { text: "Undated", date: null },
        ]).execute();

        const result = await memoryDomain.getRelevantMemories();
        const memories = result._unsafeUnwrap();
        const texts = memories.map((m) => m.text);

        expect(texts.join(",")).toContain("Today memory");
        expect(texts.join(",")).toContain("Tomorrow memory");
        expect(texts.join(",")).toContain("Undated");
      });
    });
  });
});
