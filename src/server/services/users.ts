import "server-only";

import { asc, count, eq, like, or } from "drizzle-orm";
import { getDb } from "@/db";
import { devices, users } from "@/db/schema";
import type { UserRole } from "@/db/schema";
import { ApiError } from "../errors";
import {
  hashPassword,
  normalizeUsername,
  verifyPassword,
  type SessionUser,
} from "../auth";
import type { PageResult } from "@/lib/api/schemas/common";
import type { UserDto, UserFilter } from "@/lib/api/schemas/user";

export function listUsers(session: SessionUser, filter: UserFilter): PageResult<UserDto> {
  requireAdminSync(session);

  const db = getDb();
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 20;

  const where = filter.search
    ? or(
        like(users.name, `%${filter.search}%`),
        like(users.username, `%${filter.search}%`),
      )
    : undefined;

  const total = db.select({ value: count() }).from(users).where(where).get()?.value ?? 0;

  const rows = db
    .select()
    .from(users)
    .where(where)
    .orderBy(asc(users.role), asc(users.name))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  const deviceCounts = db
    .select({ userId: devices.userId, value: count() })
    .from(devices)
    .groupBy(devices.userId)
    .all();
  const countsById = new Map(
    deviceCounts.map((r) => [r.userId ?? -1, Number(r.value)]),
  );

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      role: row.role as UserRole,
      deviceCount: countsById.get(row.id) ?? 0,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export function createUser(
  session: SessionUser,
  input: { name: string; username: string; password: string; role: UserRole },
): UserDto {
  requireAdminSync(session);
  const db = getDb();
  const username = normalizeUsername(input.username);

  const existing = db.select().from(users).where(eq(users.username, username)).get();
  if (existing) {
    throw new ApiError(409, "CONFLICT", "اسم المستخدم مستخدم بالفعل.", {
      username: ["اسم المستخدم مستخدم بالفعل"],
    });
  }

  const inserted = db
    .insert(users)
    .values({
      name: input.name.trim(),
      username,
      passwordHash: hashPassword(input.password),
      role: input.role,
    })
    .returning()
    .get();

  return {
    id: inserted.id,
    name: inserted.name,
    username: inserted.username,
    role: inserted.role as UserRole,
    deviceCount: 0,
    createdAt: inserted.createdAt.toISOString(),
  };
}

export function updateUser(
  session: SessionUser,
  id: number,
  patch: { name?: string; role?: UserRole; password?: string },
): UserDto {
  requireAdminSync(session);
  const db = getDb();
  const row = db.select().from(users).where(eq(users.id, id)).get();
  if (!row) throw new ApiError(404, "NOT_FOUND", "المستخدم غير موجود.");

  // Never allow demoting/locking out the last admin.
  if (patch.role && patch.role !== "admin" && row.role === "admin") {
    const admins = db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "admin"))
      .get()?.value ?? 0;
    if (admins <= 1) {
      throw new ApiError(
        409,
        "CONFLICT",
        "لا يمكن إزالة صلاحيات المدير من آخر مدير في النظام.",
        { role: ["يجب أن يبقى مدير واحد على الأقل"] },
      );
    }
  }

  const updated = db
    .update(users)
    .set({
      name: patch.name?.trim() ?? row.name,
      role: patch.role ?? row.role,
      passwordHash: patch.password ? hashPassword(patch.password) : row.passwordHash,
    })
    .where(eq(users.id, id))
    .returning()
    .get();

  const deviceCount =
    db.select({ value: count() }).from(devices).where(eq(devices.userId, id)).get()
      ?.value ?? 0;

  return {
    id: updated.id,
    name: updated.name,
    username: updated.username,
    role: updated.role as UserRole,
    deviceCount: Number(deviceCount),
    createdAt: updated.createdAt.toISOString(),
  };
}

export function deleteUser(session: SessionUser, id: number): { ok: true } {
  requireAdminSync(session);
  const db = getDb();
  const row = db.select().from(users).where(eq(users.id, id)).get();
  if (!row) throw new ApiError(404, "NOT_FOUND", "المستخدم غير موجود.");

  if (row.role === "admin") {
    const admins = db
      .select({ value: count() })
      .from(users)
      .where(eq(users.role, "admin"))
      .get()?.value ?? 0;
    if (admins <= 1) {
      throw new ApiError(409, "CONFLICT", "لا يمكن حذف آخر مدير في النظام.");
    }
  }

  db.transaction((tx) => {
    // Devices survive — they simply become unassigned.
    tx.update(devices)
      .set({ userId: null, updatedAt: new Date() })
      .where(eq(devices.userId, id))
      .run();
    tx.delete(users).where(eq(users.id, id)).run();
  });

  return { ok: true as const };
}

/** Self-service password change (any authenticated user). */
export function changeOwnPassword(
  session: SessionUser,
  currentPassword: string,
  newPassword: string,
): { ok: true } {
  const db = getDb();
  const row = db.select().from(users).where(eq(users.id, session.id)).get();
  if (!row) throw new ApiError(404, "NOT_FOUND", "المستخدم غير موجود.");

  if (!verifyPassword(currentPassword, row.passwordHash)) {
    throw new ApiError(422, "INVALID_API_REQUEST", "كلمة المرور الحالية غير صحيحة.", {
      currentPassword: ["كلمة المرور الحالية غير صحيحة"],
    });
  }

  db.update(users).set({ passwordHash: hashPassword(newPassword) }).where(eq(users.id, row.id)).run();
  return { ok: true as const };
}

/** Lightweight list used by the "إسناد إلى مستخدم" dialog. */
export function listUserOptions(): { id: number; name: string; username: string }[] {
  return getDb()
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .orderBy(asc(users.name))
    .all();
}

function requireAdminSync(session: SessionUser): void {
  if (session.role !== "admin") {
    throw new ApiError(403, "FORBIDDEN", "هذا المورد متاح لمدير النظام فقط.");
  }
}
