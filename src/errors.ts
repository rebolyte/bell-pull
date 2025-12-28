export type ErrorType = "db" | "llm" | "telegram" | "validation" | "unexpected";

export class AppError extends Error {
  readonly _tag = "AppError";

  constructor(
    readonly type: ErrorType,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = `AppError.${type}`;
  }
}

export const appError = (type: ErrorType, message: string, cause?: unknown) =>
  new AppError(type, message, { cause });

export const toAppError = (type: ErrorType, message: string) =>
  (cause: unknown) => appError(type, message, cause);

export const dbError = (msg: string) => toAppError("db", msg);
export const llmError = (msg: string) => toAppError("llm", msg);
export const validationError = (msg: string) => toAppError("validation", msg);
export const telegramError = (msg: string) => toAppError("telegram", msg);
