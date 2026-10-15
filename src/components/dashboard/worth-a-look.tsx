import Link from "next/link";
import { Button } from "@/components/ui/button";

type Props = {
  body: string;
  primaryLabel: string;
  moreCount: number;
  busy?: boolean;
  onPrimary?: () => void;
  onDismiss?: () => void;
};

export function WorthALook({ body, primaryLabel, moreCount, busy, onPrimary, onDismiss }: Props) {
  return (
    <section className="card flex flex-col gap-4 px-6 py-[17px] md:min-h-[102px] md:flex-row md:items-center md:gap-10">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[13px] leading-[18px] text-text-muted">
          Worth a look
          {moreCount > 0 && (
            <Link href="/insights" className="font-medium text-brand hover:underline">
              +{moreCount} more
            </Link>
          )}
        </p>
        <p data-testid="worth-body" className="mt-1 text-[15px] leading-[22px] text-text">
          {body}
        </p>
      </div>
      <div className="flex shrink-0 gap-[10px]">
        <Button
          onClick={onPrimary}
          disabled={busy}
          data-testid="worth-primary"
          className="h-[43px] rounded-[9px] border-0 bg-brand px-[18px] text-[14px] font-semibold text-white hover:bg-brand-hover"
        >
          {primaryLabel}
        </Button>
        <Button
          variant="outline"
          onClick={onDismiss}
          disabled={busy}
          data-testid="worth-dismiss"
          className="h-[43px] rounded-[9px] border-line bg-surface px-[17px] text-[14px] font-medium text-text hover:bg-muted-fill"
        >
          Not now
        </Button>
      </div>
    </section>
  );
}
