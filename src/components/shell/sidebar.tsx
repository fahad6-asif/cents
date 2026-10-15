"use client";

import { MAIN_NAV, SETTINGS_NAV } from "@/lib/nav";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";
import { UserBlock } from "./user-block";

export function Sidebar({ userName }: { userName: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-line bg-sidebar-bg md:flex">
      <div className="px-[22px] pt-5">
        <BrandMark />
      </div>
      <nav aria-label="Main" className="mt-6 flex flex-col gap-[2px] px-[14px]">
        {MAIN_NAV.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}
      </nav>
      <div className="mt-auto px-[14px] pb-8">
        <NavLink item={SETTINGS_NAV} />
        <div className="mt-[9px] mb-[13px] h-px bg-line" />
        <UserBlock name={userName} />
      </div>
    </aside>
  );
}
