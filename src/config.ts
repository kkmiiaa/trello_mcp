import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  SERVICE_NAME: z.string().default("trello-actions-proxy"),
  SERVICE_VERSION: z.string().default("0.1.0"),
  INTERNAL_TOKEN: z.string().optional(),
  PREVIEW_TOKEN_SECRET: z.string().optional(),
  TRELLO_API_KEY: z.string().min(1, "TRELLO_API_KEY is required"),
  TRELLO_API_TOKEN: z.string().min(1, "TRELLO_API_TOKEN is required"),
  TRELLO_ALLOWED_BOARD_IDS: z.string().optional(),
  TRELLO_BASE_URL: z.string().url().default("https://api.trello.com/1"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const message = parsed.error.issues.map((issue) => issue.message).join("; ");
  throw new Error(`Invalid environment configuration: ${message}`);
}

const allowedIdsRaw = parsed.data.TRELLO_ALLOWED_BOARD_IDS ?? "";
const allowedBoardIds = allowedIdsRaw
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export const config = {
  nodeEnv: parsed.data.NODE_ENV,
  host: parsed.data.HOST,
  port: parsed.data.PORT,
  logLevel: parsed.data.LOG_LEVEL,
  serviceName: parsed.data.SERVICE_NAME,
  serviceVersion: parsed.data.SERVICE_VERSION,
  internalToken: parsed.data.INTERNAL_TOKEN,
  previewTokenSecret: parsed.data.PREVIEW_TOKEN_SECRET,
  trello: {
    apiKey: parsed.data.TRELLO_API_KEY,
    apiToken: parsed.data.TRELLO_API_TOKEN,
    allowedBoardIds,
    baseUrl: parsed.data.TRELLO_BASE_URL,
    timeoutMs: parsed.data.REQUEST_TIMEOUT_MS
  }
};
