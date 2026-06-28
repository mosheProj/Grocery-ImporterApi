import { Readable } from "node:stream";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import { importProductCsv } from "./importProductCsv";

interface MockDocumentRef {
  path: string;
  collection: (name: string) => MockCollectionRef;
}

interface MockCollectionRef {
  doc: (id: string) => MockDocumentRef;
}

const createMockDocumentRef = (path: string): MockDocumentRef => ({
  path,
  collection: (name: string) => createMockCollectionRef(`${path}/${name}`),
});

const createMockCollectionRef = (path: string): MockCollectionRef => ({
  doc: (id: string) => createMockDocumentRef(`${path}/${id}`),
});

const createMockFirestore = () => {
  const batches: Array<{
    set: ReturnType<typeof vi.fn>;
    commit: ReturnType<typeof vi.fn>;
  }> = [];
  const documentStore = new Map<string, Record<string, unknown>>();

  const db = {
    batch: vi.fn(() => {
      const batch = {
        set: vi.fn((documentRef: MockDocumentRef, payload: Record<string, unknown>) => {
          documentStore.set(documentRef.path, {
            ...(documentStore.get(documentRef.path) ?? {}),
            ...payload,
          });
        }),
        commit: vi.fn().mockResolvedValue(undefined),
      };
      batches.push(batch);
      return batch;
    }),
    collection: vi.fn((name: string) => createMockCollectionRef(name)),
    runTransaction: vi.fn(async (callback) => {
      const transaction = {
        get: vi.fn(async (documentRef: MockDocumentRef) => ({
          exists: documentStore.has(documentRef.path),
          get: (field: string) => documentStore.get(documentRef.path)?.[field],
        })),
        set: vi.fn((documentRef: MockDocumentRef, payload: Record<string, unknown>) => {
          documentStore.set(documentRef.path, {
            ...(documentStore.get(documentRef.path) ?? {}),
            ...payload,
          });
        }),
      };

      return callback(transaction);
    }),
  };

  return {
    db: db as unknown as Firestore,
    batches,
  };
};

describe("importProductCsv", () => {
  it("upserts products, categories, and price lists with numeric ids", async () => {
    const { db, batches } = createMockFirestore();
    const csv = [
      "ProductId,product desc,categoryId,category desc,new price,weightable",
      "1001,Milk,dairy,Dairy Products,7.50,false",
      "1002,Bananas,produce,Fruits and Vegetables,4.20,true",
    ].join("\n");

    const result = await importProductCsv({
      db,
      batchSize: 5,
      file: {
        name: "imports/products/sample-products.csv",
        createReadStream: () => Readable.from([csv]),
      },
    });

    const setCalls = batches.flatMap((batch) => batch.set.mock.calls);
    const writtenPaths = setCalls.map(([documentRef]) => (documentRef as MockDocumentRef).path);
    const firstProductPayload = setCalls[0][1] as Record<string, unknown>;
    const firstCategoryPayload = setCalls[1][1] as Record<string, unknown>;
    const firstPriceListPayload = setCalls[2][1] as Record<string, unknown>;

    expect(result).toMatchObject({
      rowCount: 2,
      upsertedCount: 2,
      categoryUpsertedCount: 2,
      priceListUpsertedCount: 2,
      batchCommitCount: 2,
    });
    expect(writtenPaths).toEqual([
      "products/1001",
      "categories/dairy",
      "PriceLists/1001",
      "products/1002",
      "categories/produce",
      "PriceLists/1002",
    ]);
    expect(firstProductPayload).toMatchObject({
      id: 1,
      productId: "1001",
      productDesc: "Milk",
      categoryId: "dairy",
      weightable: false,
      active: true,
    });
    expect(firstProductPayload).not.toHaveProperty("categoryDesc");
    expect(firstProductPayload).not.toHaveProperty("price");
    expect(firstCategoryPayload).toMatchObject({
      id: 1,
      categoryDesc: "Dairy Products",
      active: true,
    });
    expect(firstCategoryPayload).not.toHaveProperty("categoryId");
    expect(firstPriceListPayload).toMatchObject({
      id: 1,
      productId: "1001",
      productDescSnapshot: "Milk",
      categoryId: "dairy",
      categoryDescSnapshot: "Dairy Products",
      price: 7.5,
      weightable: false,
      source: "csv_import",
    });
  });
});
