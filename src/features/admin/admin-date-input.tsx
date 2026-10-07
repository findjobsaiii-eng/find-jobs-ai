"use client";

import { useState } from "react";
import { isValidAdminDateKey, israelDateKey } from "./admin-dates";

export function AdminDateInput({
  value,
  onValueChange,
  label,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const today = israelDateKey();
  return (
    <input
      type="date"
      aria-label={label}
      value={draft ?? value}
      max={today}
      onChange={(event) => {
        const next = event.target.value;
        // Clearing or partially editing a date must not corrupt active queries.
        if (isValidAdminDateKey(next) && next <= today) {
          setDraft(null);
          onValueChange(next);
        } else setDraft(next);
      }}
      onBlur={() => setDraft(null)}
      className="border-input bg-background text-foreground h-10 rounded-xl border px-3 text-sm outline-none focus:ring-3 focus:ring-blue-500/20"
    />
  );
}
