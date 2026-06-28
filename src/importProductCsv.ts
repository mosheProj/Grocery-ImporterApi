import { parse } from "csv-parse";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
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
  categoryUpsertedCount: number;
  priceListUpsertedCount: number;
  batchCommitCount: number;
}

const DEFAULT_BATCH_SIZE = 450;
const WRITES_PER_ROW = 3;

const getOrCreateAutoIncrementId = async (
  db: Firestore,
  docRef: DocumentReference,
  counterName: string,
): Promise<number> =>
  db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const existingId = snapshot.exists ? snapshot.get("id") : undefined;

    if (typeof existingId === "number") {
      return existingId;
    }

    const counterRef = db.collection("counters").doc(counterName);
    const counterSnapshot = await transaction.get(counterRef);
    const nextId = Number(counterSnapshot.get("nextId") ?? 1);

    transaction.set(
      counterRef,
      {
        nextId: nextId + 1,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(
      docRef,
      {
        id: nextId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return nextId;
  });

const toFirestoreProduct = (row: ProductRow, id: number): FirebaseFirestore.DocumentData => ({
  id,
  productId: row.productId,
  productDesc: row.productDesc,
  categoryId: row.categoryId,
  weightable: row.weightable,
  active: true,
  updatedAt: FieldValue.serverTimestamp(),
});

const toFirestoreCategory = (row: ProductRow, id: number): FirebaseFirestore.DocumentData => ({
  id,
  categoryDesc: row.categoryDesc,
  active: true,
  updatedAt: FieldValue.serverTimestamp(),
});

const toFirestorePriceList = (row: ProductRow, id: number): FirebaseFirestore.DocumentData => ({
  id,
  productId: row.productId,
  productDescSnapshot: row.productDesc,
  categoryId: row.categoryId,
  categoryDescSnapshot: row.categoryDesc,
  price: row.price,
  weightable: row.weightable,
  source: "csv_import",
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
  let categoryUpsertedCount = 0;
  let priceListUpsertedCount = 0;
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
    const categoryRef = db.collection("categories").doc(row.categoryId);
    const priceListRef = db.collection("PriceLists").doc(row.productId);
    const [productId, categoryId, priceListId] = await Promise.all([
      getOrCreateAutoIncrementId(db, productRef, "products"),
      getOrCreateAutoIncrementId(db, categoryRef, "categories"),
      getOrCreateAutoIncrementId(db, priceListRef, "PriceLists"),
    ]);

    if (pendingWrites + WRITES_PER_ROW > batchSize) {
      await commitBatch();
    }

    batch.set(productRef, toFirestoreProduct(row, productId), { merge: true });
    batch.set(categoryRef, toFirestoreCategory(row, categoryId), { merge: true });
    batch.set(priceListRef, toFirestorePriceList(row, priceListId), { merge: true });
    pendingWrites += WRITES_PER_ROW;
    upsertedCount += 1;
    categoryUpsertedCount += 1;
    priceListUpsertedCount += 1;
  }

  if (rowCount === 0) {
    throw new Error(`CSV file ${file.name} does not contain any product rows`);
  }

  await commitBatch();

  logger.info("Finished CSV import", {
    fileName: file.name,
    rowCount,
    upsertedCount,
    categoryUpsertedCount,
    priceListUpsertedCount,
    batchCommitCount,
  });

  return {
    rowCount,
    upsertedCount,
    categoryUpsertedCount,
    priceListUpsertedCount,
    batchCommitCount,
  };
};
