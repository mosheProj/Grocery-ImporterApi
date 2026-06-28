import { describe, expect, it } from "vitest";

import { buildHistoryFileName } from "./archiveCsv";

describe("buildHistoryFileName", () => {
  it("moves a CSV file into the history folder with a timestamp suffix", () => {
    const destination = buildHistoryFileName(
      "imports/products/products.csv",
      "History/",
      new Date("2026-06-28T20:56:30.123Z"),
    );

    expect(destination).toBe("History/products_20260628_205630_123.csv");
  });

  it("normalizes a history folder without a trailing slash", () => {
    const destination = buildHistoryFileName(
      "imports/products/prices.csv",
      "History",
      new Date("2026-06-28T20:56:30.123Z"),
    );

    expect(destination).toBe("History/prices_20260628_205630_123.csv");
  });
});
