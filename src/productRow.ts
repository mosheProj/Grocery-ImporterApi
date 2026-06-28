import { z } from "zod";

export type RawCsvRow = Record<string, unknown>;

const normalizeHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

const getFieldValue = (row: RawCsvRow, aliases: string[]): unknown => {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));

  for (const [key, value] of Object.entries(row)) {
    if (normalizedAliases.has(normalizeHeader(key))) {
      return value;
    }
  }

  return undefined;
};

const stringFromField = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return value;
};

const numberFromField = (value: unknown): unknown => {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/[₪$,\s]/g, "");
  return normalized ? Number(normalized) : undefined;
};

const booleanFromField = (value: unknown): unknown => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1 ? true : value === 0 ? false : value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "y", "weightable", "weighable"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "not weightable", "not weighable"].includes(normalized)) {
    return false;
  }

  return value;
};

export const productRowSchema = z.object({
  productId: z.preprocess(
    stringFromField,
    z.string().min(1, "ProductId is required"),
  ),
  productDesc: z.preprocess(
    stringFromField,
    z.string().min(1, "product desc is required"),
  ),
  categoryId: z.preprocess(
    stringFromField,
    z.string().min(1, "categoryId is required"),
  ),
  categoryDesc: z.preprocess(
    stringFromField,
    z.string().min(1, "category desc is required"),
  ),
  price: z.preprocess(
    numberFromField,
    z.number().finite("price must be a valid number").nonnegative("price must be zero or greater"),
  ),
  weightable: z.preprocess(
    booleanFromField,
    z.boolean("weightable must be a boolean-like value"),
  ),
});

export type ProductRow = z.infer<typeof productRowSchema>;

export class CsvRowValidationError extends Error {
  constructor(
    readonly rowNumber: number,
    readonly issues: string[],
  ) {
    super(`CSV row ${rowNumber} failed validation: ${issues.join("; ")}`);
    this.name = "CsvRowValidationError";
  }
}

export const normalizeProductRow = (row: RawCsvRow, rowNumber: number): ProductRow => {
  const candidate = {
    productId: getFieldValue(row, ["ProductId", "product id", "productId"]),
    productDesc: getFieldValue(row, ["product desc", "product description", "productDesc"]),
    categoryId: getFieldValue(row, ["categoryId", "category id", "category"]),
    categoryDesc: getFieldValue(row, ["category desc", "category description", "categoryDesc"]),
    price: getFieldValue(row, ["new price", "price"]),
    weightable: getFieldValue(row, ["weightable", "wieghtable", "weighable"]),
  };

  const result = productRowSchema.safeParse(candidate);

  if (!result.success) {
    throw new CsvRowValidationError(
      rowNumber,
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }

  return result.data;
};
