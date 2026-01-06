import { ZodError } from "zod";

export type ErrorCode =
  | "BAD_REQUEST"
  | "FORBIDDEN"
  | "TRELLO_UNAUTHORIZED"
  | "TRELLO_RATE_LIMIT"
  | "TRELLO_ERROR"
  | "INTERNAL";

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const toErrorResponse = (error: AppError) => ({
  error: {
    code: error.code,
    message: error.message,
    details: error.details
  }
});

export const mapUnknownError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AppError("BAD_REQUEST", "Invalid request", 400, error.flatten());
  }

  return new AppError("INTERNAL", "Unexpected error", 500);
};
