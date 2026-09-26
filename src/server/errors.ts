/**
 * Typed server-side errors and RFC-7807-style problem responses.
 * Arabic titles surface directly in the UI (toasts / ApiErrorState).
 */

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "INVALID_API_REQUEST"
  | "INVALID_API_RESPONSE"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNSUPPORTED_OPERATION"
  | "NETWORK_ADAPTER_ERROR"
  | "INTERNAL";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly fields?: Record<string, string[]>;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}
