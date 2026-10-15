"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { MAIN_NAV, SETTINGS_NAV } from "@/lib/nav";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";
import { UserBlock } from "./user-block";

export function MobileTopBar({ userName }: { userName: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-sidebar-bg px-4 md:hidden">
      <BrandMark />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          className="flex size-10 items-center justify-center rounded-[9px] text-text hover:bg-nav-active/60"
          aria-label="Open menu"
        >
          <Menu className="size-5" strokeWidth={1.75} />
        </SheetTrigger>
        <SheetContent side="left" className="flex w-[264px] flex-col gap-0 border-line bg-sidebar-bg p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="px-[22px] pt-5">
            <BrandMark />
          </div>
          <nav aria-label="Main" className="mt-6 flex flex-col gap-[2px] px-[14px]">
            {MAIN_NAV.map((item) => (
              <NavLink key={item.href} item={item} onNavigate={close} />
            ))}
          </nav>
          <div className="mt-auto px-[14px] pb-8">
            <NavLink item={SETTINGS_NAV} onNavigate={close} />
            <div className="mt-[9px] mb-[13px] h-px bg-line" />
            <UserBlock name={userName} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
