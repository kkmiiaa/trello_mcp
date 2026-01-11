import crypto from "crypto";
import { AppError } from "../errors.js";
import { config } from "../config.js";

export type PreviewAction =
  | "createCard"
  | "addComment"
  | "updateCard"
  | "createList"
  | "updateList"
  | "updateBoard"
  | "batch";

export type PreviewPayload = {
  action: PreviewAction;
  payload: Record<string, unknown>;
  exp: number;
};

const getSecret = () => {
  if (!config.previewTokenSecret) {
    throw new AppError("FORBIDDEN", "Write access is not configured", 403);
  }
  return config.previewTokenSecret;
};

const sign = (data: string) =>
  crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");

export const generatePreviewToken = (payload: PreviewPayload) => {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encoded);
  return `${encoded}.${signature}`;
};

export const verifyPreviewToken = (token: string): PreviewPayload => {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) {
    throw new AppError("BAD_REQUEST", "Invalid commit token", 400);
  }
  const expected = sign(encoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) {
    throw new AppError("FORBIDDEN", "Invalid commit token", 403);
  }
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new AppError("FORBIDDEN", "Invalid commit token", 403);
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PreviewPayload;
  if (Date.now() > payload.exp) {
    throw new AppError("FORBIDDEN", "Commit token expired", 403);
  }

  return payload;
};
