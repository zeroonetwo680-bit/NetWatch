import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { UsersView } from "@/components/users/users-view";
import { getSession } from "@/server/auth";

export const metadata: Metadata = { title: "المستخدمون" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await getSession();
  // Non-admins never learn that this route exists.
  if (!session || session.role !== "admin") notFound();

  return <UsersView />;
}
