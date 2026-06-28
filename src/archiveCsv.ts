import path from "node:path";

import { logger } from "./logger";

export interface StorageFileMover {
  name: string;
  copy: (destination: string) => Promise<unknown>;
  delete: (options?: { ignoreNotFound?: boolean }) => Promise<unknown>;
}

const timestampForFileName = (date = new Date()): string =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .replace("Z", "")
    .replace(".", "_");

export const buildHistoryFileName = (
  sourceFileName: string,
  historyFolder: string,
  date = new Date(),
): string => {
  const originalName = path.posix.basename(sourceFileName);
  const extension = path.posix.extname(originalName) || ".csv";
  const baseName = path.posix.basename(originalName, extension);
  const normalizedHistoryFolder = historyFolder.endsWith("/") ? historyFolder : `${historyFolder}/`;

  return `${normalizedHistoryFolder}${baseName}_${timestampForFileName(date)}${extension}`;
};

export const archiveCsvFile = async (
  file: StorageFileMover,
  historyFolder: string,
): Promise<string> => {
  const destination = buildHistoryFileName(file.name, historyFolder);

  logger.info("Archiving processed CSV file", {
    sourceFileName: file.name,
    destinationFileName: destination,
  });

  await file.copy(destination);
  await file.delete({ ignoreNotFound: true });

  logger.info("Archived processed CSV file", {
    sourceFileName: file.name,
    destinationFileName: destination,
  });

  return destination;
};
