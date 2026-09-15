import type { ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "./button";

export function FloatingPanel({
  label,
  icon,
  children,
  side = "bottom",
  className,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        render={<Button nativeButton variant="outline" size="icon" />}
        aria-label={label}
        className={`${className} size-12 rounded-full shadow-md`}
      >
        {icon}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side={side}
          align="start"
          sideOffset={10}
          collisionPadding={16}
          className="z-40"
        >
          <Popover.Popup
            aria-label={label}
            className="bg-popover text-popover-foreground border-border max-h-[var(--available-height)] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border p-3 text-start shadow-lg transition-[opacity,transform] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
