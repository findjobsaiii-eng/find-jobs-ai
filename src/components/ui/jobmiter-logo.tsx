import Image from "next/image";
import { cn } from "@/lib/utils";

const ICON_SIZE = 1254;

export function JobmiterMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/icon.png"
      alt=""
      width={ICON_SIZE}
      height={ICON_SIZE}
      className={cn("size-9 object-contain", className)}
    />
  );
}

export function JobmiterLogo({
  className,
  compact = false,
  responsive = false,
}: {
  className?: string;
  compact?: boolean;
  responsive?: boolean;
}) {
  if (compact) {
    return (
      <span role="img" aria-label="JOBMITER" className={className}>
        <JobmiterMark />
      </span>
    );
  }

  return (
    <span
      dir="ltr"
      role="img"
      aria-label="JOBMITER"
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      {responsive ? <JobmiterMark className="sm:hidden" /> : null}
      <Image
        src="/brand/logo.png"
        alt=""
        width={2172}
        height={724}
        className={cn(
          "h-9 w-auto object-contain",
          responsive && "hidden sm:block",
        )}
      />
    </span>
  );
}
