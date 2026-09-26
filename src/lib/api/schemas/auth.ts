import { z } from "zod";

export const roleSchema = z.enum(["admin", "user"]);

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, "اسم المستخدم مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export const sessionUserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  username: z.string(),
  role: roleSchema,
});

export const okSchema = z.object({ ok: z.literal(true) });

export type Role = z.infer<typeof roleSchema>;
export type SessionUserDto = z.infer<typeof sessionUserSchema>;
