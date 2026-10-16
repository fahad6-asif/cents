import type { ReactNode } from "react";

/** Header used by every page except Overview: same type scale as the Overview greeting. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[28px] leading-[1.2] font-semibold tracking-[-0.02em] text-text md:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-[7px] text-[15px] leading-[21px] text-text-secondary">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Section title inside a card. */
export function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[14px] leading-[20px] font-semibold text-text">{children}</h2>
      {aside}
    </div>
  );
}
