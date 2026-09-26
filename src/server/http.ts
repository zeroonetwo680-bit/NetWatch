import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output as zodOutput } from "zod";
import { ApiError, type ApiErrorCode } from "./errors";

export type ApiProblem = {
  status: number;
  code: ApiErrorCode;
  title: string;
  detail?: string;
  fields?: Record<string, string[]>;
};

const ZOD_ARABIC: Record<string, string> = {
  required: "هذا الحقل مطلوب",
  invalid_type: "قيمة غير صالحة",
  too_small: "القيمة أصغر من المسموح",
  too_big: "القيمة أكبر من المسموح",
  invalid_string: "نص غير صالح",
  invalid_enum_value: "اختيار غير صالح",
};

type Issue = {
  code: string;
  message?: string;
  inclusive?: boolean;
  minimum?: unknown;
  maximum?: unknown;
};

function zodMessage(issue: Issue): string {
  if (issue.code === "too_small" || issue.code === "too_big") {
    const threshold = issue.code === "too_small" ? issue.minimum : issue.maximum;
    if (typeof threshold === "number") {
      return issue.code === "too_small"
        ? issue.inclusive
          ? `يجب ألا يقل عن ${threshold}`
          : `يجب أن يكون أكبر من ${threshold}`
        : issue.inclusive
          ? `يجب ألا يزيد عن ${threshold}`
          : `يجب أن يكون أصغر من ${threshold}`;
    }
  }
  // A custom (Arabic) message always wins.
  if (issue.message && /[\u0600-\u06FF]/.test(issue.message)) return issue.message;
  return ZOD_ARABIC[issue.code] ?? issue.message ?? "قيمة غير صالحة";
}

/** Wraps and validates a JSON body — 422 with Arabic field errors. */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<zodOutput<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(422, "INVALID_API_REQUEST", "البيانات المرسلة غير صالحة.");
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      const fields: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] = [...(fields[key] ?? []), zodMessage(issue)];
      }
      throw new ApiError(
        422,
        "INVALID_API_REQUEST",
        "بيانات غير صالحة — تحقّق من الحقول المميزة.",
        fields,
      );
    }
    throw err;
  }
}

/** Parses and validates search params against a Zod schema (loose: string→number). */
export function parseQuery<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): zodOutput<S> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (value !== "") raw[key] = value;
  }
  try {
    return schema.parse(raw);
  } catch (err) {
    if (err instanceof ZodError) {
      throw new ApiError(
        422,
        "INVALID_API_REQUEST",
        "معاملات البحث غير صالحة.",
        Object.fromEntries(
          err.issues.map((i) => [i.path.join(".") || "_", [zodMessage(i)]]),
        ),
      );
    }
    throw err;
  }
}

export function ok<T>(data: T, init?: { status?: number; headers?: HeadersInit }) {
  return NextResponse.json({ data }, { status: init?.status ?? 200, headers: init?.headers });
}

export function problem(error: ApiError): NextResponse {
  const body: ApiProblem = {
    status: error.status,
    code: error.code,
    title: error.message,
    detail: error.fields ? undefined : (error.cause as string | undefined),
    fields: error.fields,
  };
  return NextResponse.json(body, { status: error.status });
}

/**
 * Single entry point for every route handler: maps thrown errors to
 * RFC-7807-style problems and logs unexpected ones.
 */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return problem(err);
      console.error("[NetWatch] Unhandled route error:", err);
      return problem(
        new ApiError(500, "INTERNAL", "حدث خطأ غير متوقع في الخادم."),
      );
    }
  };
}

/** Validates an outgoing payload against its contract before sending. */
export function okValidated<S extends ZodTypeAny>(
  data: zodOutput<S>,
  schema: S,
): NextResponse {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error("[NetWatch] Response contract violation:", result.error);
    return problem(
      new ApiError(
        502,
        "INVALID_API_RESPONSE",
        "البيانات غير مطابقة للعقد المتفق عليه.",
      ),
    );
  }
  return ok(result.data);
}
