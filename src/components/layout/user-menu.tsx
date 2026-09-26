"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout, useSession } from "@/lib/api/modules/auth/hooks";
import { isApiError } from "@/lib/api/client";

export function UserMenu() {
  const { data: user } = useSession();
  const logout = useLogout();
  const router = useRouter();

  const initials = user?.name?.slice(0, 2) ?? "؟";

  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="قائمة الحساب">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block font-semibold">{user?.name ?? "—"}</span>
          <span className="block text-xs font-normal text-muted-foreground ltr-island">
            {user ? `@${user.username}` : ""}
          </span>
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {user?.role === "admin" ? "مدير النظام" : "مستخدم"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            logout.mutate(undefined, {
              onError: (error) =>
                toast.error(
                  isApiError(error) ? error.title : "تعذّر تسجيل الخروج",
                ),
              onSuccess: () => router.replace("/login"),
            });
          }}
        >
          <LogOut className="size-4" aria-hidden />
          تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
