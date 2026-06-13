import { cn } from "../../lib/utils";

interface LoadingSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={cn("grid gap-3", className)} aria-label="加载中">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-[var(--radius-md)] border border-[var(--line)] bg-[linear-gradient(90deg,var(--paper-soft),var(--paper),var(--paper-soft))]"
        />
      ))}
    </div>
  );
}
