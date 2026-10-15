import { Button } from "@/components/ui/button";

type Props = { body: string; primaryLabel: string };

// Phase 1: static. The highest-severity alert and its actions are wired in Phase 5/7.
export function WorthALook({ body, primaryLabel }: Props) {
  return (
    <section className="card flex flex-col gap-4 px-6 py-[17px] md:flex-row md:items-center md:gap-10">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-[18px] text-text-muted">Worth a look</p>
        <p className="mt-1 text-[15px] leading-[22px] text-text">{body}</p>
      </div>
      <div className="flex shrink-0 gap-[10px]">
        <Button className="h-[43px] rounded-[9px] border-0 bg-brand px-[18px] text-[14px] font-semibold text-white hover:bg-brand-hover">
          {primaryLabel}
        </Button>
        <Button
          variant="outline"
          className="h-[43px] rounded-[9px] border-line bg-surface px-[17px] text-[14px] font-medium text-text hover:bg-muted-fill"
        >
          Not now
        </Button>
      </div>
    </section>
  );
}
