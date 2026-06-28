import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { onObjectFinalized } from "firebase-functions/v2/storage";

import { archiveCsvFile } from "./archiveCsv";
import { getImporterConfig, type ImporterConfig } from "./config";
import { sendImportFailureEmail } from "./emailNotifier";
import {
  recordImportFailure,
  recordImportStarted,
  recordImportSuccess,
  type StorageObjectIdentity,
} from "./importAttempts";
import { importProductCsv } from "./importProductCsv";
import { errorToLogContext, logger } from "./logger";

initializeApp();

const db = getFirestore();
const triggerConfig = getImporterConfig();

export const shouldProcessStorageObject = (
  fileName: string | undefined,
  config: Pick<ImporterConfig, "importFolder" | "historyFolder">,
): fileName is string => {
  if (!fileName) {
    return false;
  }

  const normalizedName = fileName.replace(/^\/+/, "");
  const lowerName = normalizedName.toLowerCase();

  return (
    normalizedName.startsWith(config.importFolder) &&
    !normalizedName.startsWith(config.historyFolder) &&
    lowerName.endsWith(".csv")
  );
};

export const importProductCsvOnUpload = onObjectFinalized(
  {
    bucket: triggerConfig.storageBucket,
    retry: true,
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (event) => {
    const startedAt = Date.now();
    const config = getImporterConfig();
    const fileName = event.data.name;
    const bucketName = event.data.bucket;

    logger.info("Received Storage finalize event", {
      bucket: bucketName,
      fileName,
      generation: event.data.generation,
      storageBucket: config.storageBucket,
      importFolder: config.importFolder,
      historyFolder: config.historyFolder,
    });

    if (!shouldProcessStorageObject(fileName, config)) {
      logger.info("Skipping Storage object because it is outside the import contract", {
        bucket: bucketName,
        fileName,
      });
      logger.info("CSV import function summary", {
        status: "skipped",
        reason: "outside_import_contract",
        bucket: bucketName,
        fileName,
        durationMs: Date.now() - startedAt,
      });
      return;
    }

    const objectIdentity: StorageObjectIdentity = {
      bucket: bucketName,
      name: fileName,
      generation: event.data.generation ? String(event.data.generation) : undefined,
    };

    const file = getStorage().bucket(bucketName).file(fileName);

    await recordImportStarted(db, objectIdentity);

    try {
      const importResult = await importProductCsv({ db, file });
      const archivedFileName = await archiveCsvFile(file, config.historyFolder);

      await recordImportSuccess(db, objectIdentity, importResult, archivedFileName);

      logger.info("Completed CSV import process", {
        bucket: bucketName,
        fileName,
        archivedFileName,
        ...importResult,
      });
      logger.info("CSV import function summary", {
        status: "succeeded",
        bucket: bucketName,
        fileName,
        archivedFileName,
        rowCount: importResult.rowCount,
        upsertedCount: importResult.upsertedCount,
        categoryUpsertedCount: importResult.categoryUpsertedCount,
        priceListUpsertedCount: importResult.priceListUpsertedCount,
        batchCommitCount: importResult.batchCommitCount,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const failure = await recordImportFailure(db, objectIdentity, error);

      logger.error("CSV import attempt failed", {
        bucket: bucketName,
        fileName,
        attemptCount: failure.attemptCount,
        shouldRetry: failure.shouldRetry,
        ...errorToLogContext(error),
      });

      if (failure.shouldRetry) {
        logger.info("CSV import function summary", {
          status: "failed_retrying",
          bucket: bucketName,
          fileName,
          attemptCount: failure.attemptCount,
          durationMs: Date.now() - startedAt,
          ...errorToLogContext(error),
        });
        throw error;
      }

      await sendImportFailureEmail({
        config,
        fileName,
        bucket: bucketName,
        attemptCount: failure.attemptCount,
        error,
      });

      logger.error("CSV import retries exhausted", {
        bucket: bucketName,
        fileName,
        attemptCount: failure.attemptCount,
      });
      logger.info("CSV import function summary", {
        status: "failed_exhausted",
        bucket: bucketName,
        fileName,
        attemptCount: failure.attemptCount,
        emailRecipients: config.failureEmailRecipients,
        durationMs: Date.now() - startedAt,
        ...errorToLogContext(error),
      });
    }
  },
);
