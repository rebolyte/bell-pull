import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { withRetry } from "./lib.ts";

describe("withRetry", () => {
  it("returns result on success", async () => {
    const result = await withRetry(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("retries on ECONNRESET and succeeds", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts === 1) {
        const error = new Error("connection reset");
        (error as any).cause = { code: "ECONNRESET" };
        return Promise.reject(error);
      }
      return Promise.resolve("ok");
    };

    const result = await withRetry(fn, 3, 10);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("retries up to 3 times on ECONNRESET", async () => {
    let attempts = 0;
    const error = new Error("connection reset");
    (error as any).cause = { code: "ECONNRESET" };

    const fn = () => {
      attempts++;
      return Promise.reject(error);
    };

    await expect(withRetry(fn, 3, 10)).rejects.toThrow("connection reset");
    expect(attempts).toBe(3);
  });

  it("does not retry on other errors", async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      return Promise.reject(new Error("other error"));
    };

    await expect(withRetry(fn)).rejects.toThrow("other error");
    expect(attempts).toBe(1);
  });
});
