import Image from "next/image";
import { cn } from "@/lib/utils";

const ICON_SIZE = 1254;
type LogoVariant = "default" | "inverse";

export function JobmiterMark({
  className,
  variant = "default",
}: {
  className?: string;
  variant?: LogoVariant;
}) {
  return (
    <Image
      src={variant === "inverse" ? "/brand/icon-white.png" : "/brand/icon.png"}
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
  variant = "default",
}: {
  className?: string;
  compact?: boolean;
  responsive?: boolean;
  variant?: LogoVariant;
}) {
  if (compact) {
    return (
      <span role="img" aria-label="JOBMITER" className={className}>
        <JobmiterMark variant={variant} />
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
      {responsive ? (
        <JobmiterMark className="sm:hidden" variant={variant} />
      ) : null}
      <Image
        src={
          variant === "inverse" ? "/brand/logo-white.png" : "/brand/logo.png"
        }
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
