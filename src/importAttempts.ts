import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

import type { ImportProductCsvResult } from "./importProductCsv";

export interface StorageObjectIdentity {
  bucket: string;
  name: string;
  generation?: string;
}

export interface FailureAttemptResult {
  attemptCount: number;
  shouldRetry: boolean;
}

const MAX_ATTEMPTS = 3;

export const getImportAttemptId = (object: StorageObjectIdentity): string =>
  createHash("sha256")
    .update(`${object.bucket}/${object.name}/${object.generation ?? "unknown"}`)
    .digest("hex");

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const recordImportStarted = async (
  db: Firestore,
  object: StorageObjectIdentity,
): Promise<string> => {
  const attemptId = getImportAttemptId(object);

  await db.collection("importAttempts").doc(attemptId).set(
    {
      attemptId,
      bucket: object.bucket,
      fileName: object.name,
      generation: object.generation ?? null,
      status: "started",
      maxAttempts: MAX_ATTEMPTS,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return attemptId;
};

export const recordImportSuccess = async (
  db: Firestore,
  object: StorageObjectIdentity,
  result: ImportProductCsvResult,
  archivedFileName: string,
): Promise<void> => {
  const attemptId = getImportAttemptId(object);

  await db.collection("importAttempts").doc(attemptId).set(
    {
      status: "succeeded",
      result,
      archivedFileName,
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await writeImportLog(db, {
    attemptId,
    bucket: object.bucket,
    fileName: object.name,
    generation: object.generation ?? null,
    status: "succeeded",
    result,
    archivedFileName,
  });
};

export const recordImportFailure = async (
  db: Firestore,
  object: StorageObjectIdentity,
  error: unknown,
): Promise<FailureAttemptResult> => {
  const attemptId = getImportAttemptId(object);
  const attemptRef = db.collection("importAttempts").doc(attemptId);

  const attemptCount = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(attemptRef);
    const previousAttempts = Number(snapshot.get("attemptCount") ?? 0);
    const nextAttempts = previousAttempts + 1;
    const shouldRetry = nextAttempts < MAX_ATTEMPTS;

    transaction.set(
      attemptRef,
      {
        attemptId,
        bucket: object.bucket,
        fileName: object.name,
        generation: object.generation ?? null,
        status: shouldRetry ? "failed_retrying" : "failed_exhausted",
        attemptCount: nextAttempts,
        maxAttempts: MAX_ATTEMPTS,
        lastError: errorMessage(error),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: snapshot.exists ? snapshot.get("createdAt") : FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return nextAttempts;
  });

  const shouldRetry = attemptCount < MAX_ATTEMPTS;

  await writeImportLog(db, {
    attemptId,
    bucket: object.bucket,
    fileName: object.name,
    generation: object.generation ?? null,
    status: shouldRetry ? "failed_retrying" : "failed_exhausted",
    attemptCount,
    maxAttempts: MAX_ATTEMPTS,
    error: errorMessage(error),
  });

  return {
    attemptCount,
    shouldRetry,
  };
};

export const writeImportLog = async (
  db: Firestore,
  payload: Record<string, unknown>,
): Promise<void> => {
  await db.collection("importLogs").add({
    ...payload,
    createdAt: FieldValue.serverTimestamp(),
  });
};
