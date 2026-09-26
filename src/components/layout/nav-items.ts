import { Gauge, HardDrive, Settings, ShieldAlert, Users, Wifi } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "لوحة التحكم", icon: Gauge, adminOnly: false },
  { href: "/devices", label: "الأجهزة", icon: Wifi, adminOnly: false },
  { href: "/dns", label: "التحكم عبر DNS", icon: ShieldAlert, adminOnly: false },
  { href: "/usage", label: "الاستهلاك", icon: HardDrive, adminOnly: false },
  { href: "/speed-limits", label: "حدود السرعة", icon: Gauge, adminOnly: false },
  { href: "/settings", label: "الإعدادات", icon: Settings, adminOnly: false },
  { href: "/admin/users", label: "المستخدمون", icon: Users, adminOnly: true },
] as const;
