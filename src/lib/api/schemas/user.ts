import { z } from "zod";
import { roleSchema } from "./auth";

export const userSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  username: z.string(),
  role: roleSchema,
  deviceCount: z.number().int(),
  createdAt: z.string(),
});

export const userFilterSchema = z.object({
  search: z.string().trim().max(120).optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "الاسم مطلوب (حرفان على الأقل)").max(80),
  username: z
    .string()
    .trim()
    .min(3, "اسم المستخدم 3 أحرف على الأقل")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "اسم المستخدم بالإنجليزية والأرقام فقط"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(200),
  role: roleSchema.default("user"),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    role: roleSchema.optional(),
    password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل").max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "لا توجد بيانات للتحديث");

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string().min(6, "كلمة المرور الجديدة 6 أحرف على الأقل").max(200),
});

export type UserDto = z.infer<typeof userSchema>;
export type UserFilter = {
  search?: string;
  page?: number;
  pageSize?: number;
};
