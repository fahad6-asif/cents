import {
  ArrowDownUp,
  ChartColumn,
  ChartPie,
  LayoutGrid,
  Receipt,
  SlidersHorizontal,
  Sparkle,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGrid },
  { href: "/bills", label: "Bills", icon: Receipt },
  { href: "/transactions", label: "Transactions", icon: ArrowDownUp },
  { href: "/insights", label: "Insights", icon: ChartColumn },
  { href: "/budgets", label: "Budgets", icon: ChartPie },
  { href: "/assistant", label: "Assistant", icon: Sparkle },
];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: SlidersHorizontal };

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
