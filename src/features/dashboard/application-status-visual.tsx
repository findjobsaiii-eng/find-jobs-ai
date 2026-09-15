import type { LucideIcon } from "lucide-react";
import {
  Award,
  Bookmark,
  BriefcaseBusiness,
  Check,
  CircleX,
  ClipboardCheck,
  Handshake,
  MessageSquareText,
  PhoneCall,
  Undo2,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "./application-status";

type StatusVisual = {
  icon: LucideIcon;
  iconClass: string;
  selectedClass: string;
};

export const APPLICATION_STATUS_VISUALS: Record<
  ApplicationStatus,
  StatusVisual
> = {
  saved: {
    icon: Bookmark,
    iconClass: "bg-status-saved/10 text-status-saved",
    selectedClass:
      "border-status-saved/35 bg-status-saved/10 ring-status-saved/15",
  },
  applied: {
    icon: BriefcaseBusiness,
    iconClass: "bg-status-applied/10 text-status-applied",
    selectedClass:
      "border-status-applied/35 bg-status-applied/10 ring-status-applied/15",
  },
  recruiter_contact: {
    icon: MessageSquareText,
    iconClass: "bg-status-recruiter/10 text-status-recruiter",
    selectedClass:
      "border-status-recruiter/35 bg-status-recruiter/10 ring-status-recruiter/15",
  },
  phone_screen: {
    icon: PhoneCall,
    iconClass: "bg-status-phone/10 text-status-phone",
    selectedClass:
      "border-status-phone/35 bg-status-phone/10 ring-status-phone/15",
  },
  interview: {
    icon: UsersRound,
    iconClass: "bg-status-interview/10 text-status-interview",
    selectedClass:
      "border-status-interview/35 bg-status-interview/10 ring-status-interview/15",
  },
  assignment: {
    icon: ClipboardCheck,
    iconClass: "bg-status-assignment/10 text-status-assignment",
    selectedClass:
      "border-status-assignment/35 bg-status-assignment/10 ring-status-assignment/15",
  },
  final_interview: {
    icon: Award,
    iconClass: "bg-status-final/10 text-status-final",
    selectedClass:
      "border-status-final/35 bg-status-final/10 ring-status-final/15",
  },
  offer: {
    icon: Handshake,
    iconClass: "bg-status-offer/10 text-status-offer",
    selectedClass:
      "border-status-offer/35 bg-status-offer/10 ring-status-offer/15",
  },
  rejected: {
    icon: CircleX,
    iconClass: "bg-status-rejected/10 text-status-rejected",
    selectedClass:
      "border-status-rejected/35 bg-status-rejected/10 ring-status-rejected/15",
  },
  withdrawn: {
    icon: Undo2,
    iconClass: "bg-status-withdrawn/10 text-status-withdrawn",
    selectedClass:
      "border-status-withdrawn/35 bg-status-withdrawn/10 ring-status-withdrawn/15",
  },
};

export function ApplicationStatusIcon({
  status,
  className,
}: {
  status: ApplicationStatus;
  className?: string;
}) {
  const visual = APPLICATION_STATUS_VISUALS[status];
  const Icon = visual.icon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg",
        visual.iconClass,
        className,
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

export function ApplicationStatusChoice({
  status,
  label,
  name,
  selected,
  disabled,
  onChange,
}: {
  status: ApplicationStatus;
  label: string;
  name: string;
  selected: boolean;
  disabled?: boolean;
  onChange: (status: ApplicationStatus) => void;
}) {
  const visual = APPLICATION_STATUS_VISUALS[status];
  return (
    <label
      className={cn(
        "border-border hover:bg-muted/60 focus-within:ring-ring/40 flex min-h-12 items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm transition-[background-color,border-color,box-shadow,transform] focus-within:ring-3 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-60 motion-reduce:transition-none",
        selected && `ring-1 ${visual.selectedClass}`,
      )}
    >
      <input
        type="radio"
        name={name}
        value={status}
        checked={selected}
        disabled={disabled}
        onChange={() => onChange(status)}
        className="sr-only"
      />
      <ApplicationStatusIcon status={status} />
      <span className="min-w-0 flex-1 leading-5 font-medium">{label}</span>
      {selected ? (
        <Check
          aria-hidden="true"
          className="text-foreground/65 size-4 shrink-0"
        />
      ) : null}
    </label>
  );
}
