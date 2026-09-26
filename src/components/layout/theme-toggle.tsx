"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

const subscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // false on the server, true after hydration — avoids a setState in an effect.
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isDark ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {mounted && isDark ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  );
}
