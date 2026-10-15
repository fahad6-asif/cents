function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

export function UserBlock({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-[11px] px-[10px]">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-[12px] font-semibold text-white"
        aria-hidden
      >
        {initials(name)}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="truncate text-[13px] font-medium text-text">{name}</div>
        <div className="mt-[2.5px] text-[12px] text-text-secondary">Simulated account</div>
      </div>
    </div>
  );
}
