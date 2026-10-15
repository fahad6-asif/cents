import { Skeleton } from "@/components/ui/skeleton";

function CardSkeleton({ className, lines = 3 }: { className?: string; lines?: number }) {
  return (
    <div className={`card flex flex-col gap-3 p-6 ${className ?? ""}`}>
      <Skeleton className="h-3 w-28" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={i === 0 ? "h-8 w-1/2" : "h-3 w-full"} />
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1240px] flex-col" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-3 h-8 w-80 max-w-full" />
      <Skeleton className="mt-3 h-4 w-56" />
      <CardSkeleton className="mt-6 h-[130px] md:mt-[25px]" lines={1} />
      <div className="mt-4 flex gap-2">
        {["w-[220px]", "w-[210px]", "w-[160px]", "w-[180px]"].map((w) => (
          <Skeleton key={w} className={`h-11 shrink-0 rounded-full ${w}`} />
        ))}
      </div>
      <div className="mt-6 grid gap-5 md:mt-[30px] md:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <CardSkeleton className="h-[291px]" lines={4} />
        <CardSkeleton className="h-[291px]" lines={4} />
      </div>
      <div className="mt-5 grid gap-5 md:mt-[30px] md:grid-cols-[minmax(0,38.5fr)_minmax(0,61.5fr)]">
        <CardSkeleton className="h-[337px]" lines={6} />
        <CardSkeleton className="h-[337px]" lines={6} />
      </div>
    </div>
  );
}
