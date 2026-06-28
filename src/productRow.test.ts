import { describe, expect, it } from "vitest";

import { CsvRowValidationError, normalizeProductRow } from "./productRow";

describe("normalizeProductRow", () => {
  it("normalizes supported CSV headers into a product row", () => {
    const row = normalizeProductRow(
      {
        ProductId: " 123 ",
        "product desc": " Milk 3% ",
        categoryId: " dairy ",
        "category desc": " Dairy Products ",
        "new price": " 7.50 ",
        wieghtable: "no",
      },
      2,
    );

    expect(row).toEqual({
      productId: "123",
      productDesc: "Milk 3%",
      categoryId: "dairy",
      categoryDesc: "Dairy Products",
      price: 7.5,
      weightable: false,
    });
  });

  it("accepts boolean-like weightable values", () => {
    const row = normalizeProductRow(
      {
        productId: "456",
        productDesc: "Bananas",
        categoryId: "produce",
        categoryDesc: "Produce",
        price: "4",
        weightable: "yes",
      },
      2,
    );

    expect(row.weightable).toBe(true);
  });

  it("throws a row validation error for invalid rows", () => {
    expect(() =>
      normalizeProductRow(
        {
          ProductId: "",
          "product desc": "Milk",
          categoryId: "dairy",
          "category desc": "Dairy",
          "new price": "not-a-price",
          weightable: "maybe",
        },
        4,
      ),
    ).toThrow(CsvRowValidationError);
  });
});
