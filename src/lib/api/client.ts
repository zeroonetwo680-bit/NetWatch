import type { z } from "zod";
import { apiProblemSchema } from "./schemas/common";

/**
 * Browser-side HTTP client. The single place that talks to /api.
 * Components never call fetch directly — they use the query hooks.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** Arabic, user-facing title (mirrors the server's ApiProblem.title). */
  get title(): string {
    return this.message;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

export const API_TIMEOUT_MS = 15_000;

type RequestOptions<S extends z.ZodTypeAny> = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  schema?: S;
  signal?: AbortSignal;
};

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  const base = path.startsWith("/api") ? path : `/api${path}`;
  if (!query) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Redirects to /login once per session-expiry, not per hook. */
let redirecting = false;
function handleUnauthorized() {
  if (redirecting) return;
  redirecting = true;
  if (typeof window !== "undefined") {
    const next = `${window.location.pathname}${window.location.search}`;
    // Deliberate full navigation: clears every cached query on session expiry.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(next)}`;
  }
  setTimeout(() => {
    redirecting = false;
  }, 2000);
}

export async function apiFetch<S extends z.ZodTypeAny>(
  path: string,
  options: RequestOptions<S> = {},
): Promise<z.output<S>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort);

  try {
    const response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      credentials: "include",
      headers:
        options.body === undefined
          ? { Accept: "application/json" }
          : { Accept: "application/json", "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const parsed = apiProblemSchema.safeParse(payload);
      if (parsed.success) {
        if (parsed.data.status === 401 && !path.startsWith("/api/auth/")) {
          handleUnauthorized();
        }
        throw new ApiError(
          parsed.data.status,
          parsed.data.code,
          parsed.data.title,
          parsed.data.fields,
        );
      }
      throw new ApiError(
        response.status,
        "INTERNAL",
        "حدث خطأ غير متوقع في الخادم.",
      );
    }

    const envelope = (payload as { data?: unknown } | null)?.data;
    const data = envelope !== undefined ? envelope : payload;

    if (!options.schema) return data as z.output<S>;

    const result = options.schema.safeParse(data);
    if (!result.success) {
      console.error("[NetWatch] Response contract violation:", result.error);
      throw new ApiError(
        502,
        "INVALID_API_RESPONSE",
        "البيانات غير مطابقة للعقد المتفق عليه.",
      );
    }
    return result.data as z.output<S>;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(408, "TIMEOUT", "انتهت مهلة الاتصال بالخادم.");
    }
    throw new ApiError(0, "NETWORK", "تعذّر الاتصال بالخادم.");
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
