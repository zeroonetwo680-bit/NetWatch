import { z } from "zod";

export const pageMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export const pageResultSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({ items: z.array(item), meta: pageMetaSchema });

export const apiProblemSchema = z.object({
  status: z.number(),
  code: z.string(),
  title: z.string(),
  detail: z.string().optional(),
  fields: z.record(z.array(z.string())).optional(),
});

export const listFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional().catch(undefined),
});

export type PageMeta = z.infer<typeof pageMetaSchema>;
export type PageResult<T> = { items: T[]; meta: PageMeta };
