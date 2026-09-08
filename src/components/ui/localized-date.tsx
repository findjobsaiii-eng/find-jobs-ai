import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale/en-US";
import { he } from "date-fns/locale/he";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type LocalizedDateProps = {
  value: Date | number;
  children?: (relativeDate: string) => ReactNode;
  className?: string;
};

export function LocalizedDate({
  value,
  children = (relativeDate) => relativeDate,
  className,
}: LocalizedDateProps) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("he") ? he : enUS;
  const date = value instanceof Date ? value : new Date(value);
  const relativeDate = formatDistanceToNow(date, { addSuffix: true, locale });
  const fullDate = format(date, "PPPP, p", { locale });

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        delay={250}
        className={cn(
          "decoration-border hover:decoration-muted-foreground focus-visible:ring-ring/40 font-inherit cursor-help rounded-sm bg-transparent p-0 text-inherit underline decoration-dotted underline-offset-3 transition-[text-decoration-color,box-shadow] outline-none focus-visible:ring-2 motion-reduce:transition-none",
          className,
        )}
      >
        <time dateTime={date.toISOString()}>{children(relativeDate)}</time>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner
          sideOffset={7}
          collisionPadding={12}
          className="z-50"
        >
          <Tooltip.Popup className="bg-popover text-popover-foreground border-border max-w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-lg border px-3 py-2 text-center text-xs shadow-lg transition-[transform,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
            {fullDate}
            <Tooltip.Arrow className="bg-popover border-border size-2.5 rotate-45 border-s border-t" />
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
