import { cn } from "@/lib/utils";

export function JobmiterMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={cn("size-9", className)}
      aria-hidden="true"
    >
      <path
        d="M38 8v30c0 10-6 17-16 17-5 0-9-2-12-5"
        stroke="var(--brand-electric)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="m29 15 9-9 9 9"
        stroke="var(--brand-electric)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="39" r="7" fill="var(--brand-teal)" />
      <path
        d="M9 52c4 3 8 4 13 4"
        stroke="var(--brand-teal)"
        strokeWidth="6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function JobmiterLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <span
      dir="ltr"
      className={cn("inline-flex items-center gap-2.5", className)}
    >
      <JobmiterMark className="size-8" />
      {compact ? null : (
        <span className="text-brand-midnight dark:text-brand-snow text-[1.05rem] font-extrabold tracking-[0.08em]">
          JOBMITER
        </span>
      )}
    </span>
  );
}
