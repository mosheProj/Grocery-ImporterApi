import { parse } from "csv-parse";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import { logger } from "./logger";
import { normalizeProductRow, type ProductRow, type RawCsvRow } from "./productRow";

export interface StorageFileReader {
  name: string;
  createReadStream: () => NodeJS.ReadableStream;
}

export interface ImportProductCsvInput {
  db: Firestore;
  file: StorageFileReader;
  batchSize?: number;
}

export interface ImportProductCsvResult {
  rowCount: number;
  upsertedCount: number;
  batchCommitCount: number;
}

const DEFAULT_BATCH_SIZE = 450;

const toFirestoreProduct = (row: ProductRow): FirebaseFirestore.DocumentData => ({
  productId: row.productId,
  productDesc: row.productDesc,
  categoryId: row.categoryId,
  categoryDesc: row.categoryDesc,
  price: row.price,
  weightable: row.weightable,
  updatedAt: FieldValue.serverTimestamp(),
});

export const importProductCsv = async ({
  db,
  file,
  batchSize = DEFAULT_BATCH_SIZE,
}: ImportProductCsvInput): Promise<ImportProductCsvResult> => {
  logger.info("Starting CSV stream parse", { fileName: file.name, batchSize });

  const parser = file.createReadStream().pipe(
    parse({
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }),
  );

  let batch = db.batch();
  let pendingWrites = 0;
  let rowCount = 0;
  let upsertedCount = 0;
  let batchCommitCount = 0;

  const commitBatch = async (): Promise<void> => {
    if (pendingWrites === 0) {
      return;
    }

    logger.info("Committing Firestore product upsert batch", {
      fileName: file.name,
      pendingWrites,
      batchCommitCount: batchCommitCount + 1,
    });

    await batch.commit();
    batchCommitCount += 1;
    batch = db.batch();
    pendingWrites = 0;
  };

  for await (const rawRow of parser as AsyncIterable<RawCsvRow>) {
    rowCount += 1;
    const csvLineNumber = rowCount + 1;
    const row = normalizeProductRow(rawRow, csvLineNumber);
    const productRef = db.collection("products").doc(row.productId);

    batch.set(productRef, toFirestoreProduct(row), { merge: true });
    pendingWrites += 1;
    upsertedCount += 1;

    if (pendingWrites >= batchSize) {
      await commitBatch();
    }
  }

  if (rowCount === 0) {
    throw new Error(`CSV file ${file.name} does not contain any product rows`);
  }

  await commitBatch();

  logger.info("Finished CSV import", {
    fileName: file.name,
    rowCount,
    upsertedCount,
    batchCommitCount,
  });

  return {
    rowCount,
    upsertedCount,
    batchCommitCount,
  };
};
