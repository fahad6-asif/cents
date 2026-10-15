"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, type NavItem } from "@/lib/nav";

export function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-[13.5px] rounded-[9px] px-[11px] text-[14px] transition-colors",
        active ? "bg-nav-active font-medium text-text" : "text-text-secondary hover:bg-nav-active/50",
      )}
    >
      <Icon className="size-4" strokeWidth={2} aria-hidden />
      {item.label}
    </Link>
  );
}
