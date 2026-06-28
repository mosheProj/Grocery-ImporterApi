import nodemailer from "nodemailer";

import type { ImporterConfig } from "./config";
import { logger } from "./logger";

export interface FailureEmailInput {
  config: ImporterConfig;
  fileName: string;
  bucket: string;
  attemptCount: number;
  error: unknown;
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const hasSmtpConfig = (config: ImporterConfig): boolean =>
  Boolean(
    config.smtp.host &&
      config.smtp.port &&
      config.smtp.user &&
      config.smtp.pass &&
      config.smtp.from,
  );

export const sendImportFailureEmail = async ({
  config,
  fileName,
  bucket,
  attemptCount,
  error,
}: FailureEmailInput): Promise<void> => {
  if (config.failureEmailRecipients.length === 0) {
    logger.warn("Skipping failure email because no recipients are configured", {
      fileName,
      bucket,
      attemptCount,
    });
    return;
  }

  if (!hasSmtpConfig(config)) {
    logger.warn("Skipping failure email because SMTP configuration is incomplete", {
      fileName,
      bucket,
      attemptCount,
    });
    return;
  }

  logger.info("Sending import failure email", {
    fileName,
    bucket,
    attemptCount,
    recipients: config.failureEmailRecipients,
  });

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to: config.failureEmailRecipients,
    subject: `CSV import failed after ${attemptCount} attempts`,
    text: [
      "CSV import failed after the maximum retry count.",
      "",
      `Bucket: ${bucket}`,
      `File: ${fileName}`,
      `Attempts: ${attemptCount}`,
      `Error: ${getErrorMessage(error)}`,
    ].join("\n"),
  });

  logger.info("Sent import failure email", {
    fileName,
    bucket,
    attemptCount,
  });
};
