import "dotenv/config";

export interface ImporterConfig {
  storageBucket: string;
  importFolder: string;
  historyFolder: string;
  failureEmailRecipients: string[];
  smtp: {
    host?: string;
    port: number;
    user?: string;
    pass?: string;
    from?: string;
  };
}

const withTrailingSlash = (value: string): string => {
  const trimmed = value.trim().replace(/^\/+/, "");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};

const parseRecipients = (value?: string): string[] =>
  (value ?? "")
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean);

export const getImporterConfig = (): ImporterConfig => ({
  storageBucket: process.env.IMPORT_STORAGE_BUCKET ?? "online-shop-bf396.firebasestorage.app",
  importFolder: withTrailingSlash(process.env.IMPORT_FOLDER ?? "imports/products/"),
  historyFolder: withTrailingSlash(process.env.HISTORY_FOLDER ?? "History/"),
  failureEmailRecipients: parseRecipients(process.env.IMPORT_FAILURE_EMAIL_TO),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },
});
