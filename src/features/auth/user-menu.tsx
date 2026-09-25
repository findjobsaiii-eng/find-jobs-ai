"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  ChevronDown,
  Languages,
  LoaderCircle,
  LogOut,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CurrentProfile } from "@/features/profile/profile-types";
import { cn } from "@/lib/utils";

export function UserMenu({
  identity,
  displayName,
  showProfile = true,
  tone = "light",
  readOnly = false,
}: {
  identity: CurrentProfile["identity"];
  displayName?: string | null;
  showProfile?: boolean;
  tone?: "light" | "dark";
  readOnly?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const { signOut } = useAuthActions();
  const adminAccess = useQuery(api.admin.getAccess, readOnly ? "skip" : {});
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const signingOutRef = useRef(false);
  const name =
    displayName ||
    identity.googleDisplayName ||
    identity.email ||
    t("dashboard.nav.profile");
  const initials = name.trim().slice(0, 1).toLocaleUpperCase();
  const identityContent = (
    <>
      <span className="bg-brand-teal grid size-8 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-semibold text-white">
        {identity.profileImage ? (
          <Image
            src={identity.profileImage}
            alt=""
            width={32}
            height={32}
            className="size-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
      </span>
      <span className="mx-2 hidden max-w-32 truncate text-sm font-medium md:inline">
        {name}
      </span>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "hidden size-4 md:block",
          tone === "dark" ? "text-white/55" : "text-muted-foreground",
        )}
      />
    </>
  );
  const triggerClassName = cn(
    "flex min-h-11 min-w-11 items-center justify-self-end rounded-xl p-1.5 transition-colors outline-none focus-visible:ring-3",
    tone === "dark"
      ? "hover:bg-white/10 focus-visible:ring-white/35"
      : "hover:bg-muted focus-visible:ring-ring/40",
  );

  const handleSignOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    setOpen(false);
    setSigningOut(true);
    setSignOutError(false);
    try {
      await signOut();
    } catch {
      setSignOutError(true);
      signingOutRef.current = false;
      setSigningOut(false);
    }
  };

  if (readOnly) {
    return (
      <div
        aria-label={t("dashboard.userMenu")}
        aria-disabled="true"
        className={triggerClassName}
      >
        {identityContent}
      </div>
    );
  }

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label={t("dashboard.userMenu")}
          className={triggerClassName}
        >
          {identityContent}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="z-50"
          >
            <Popover.Popup className="bg-popover text-popover-foreground border-border w-60 origin-[var(--transform-origin)] rounded-xl border p-2 text-start shadow-xl transition-[transform,opacity] duration-150 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
              <div className="border-border mb-1 border-b px-3 py-2.5">
                <p className="truncate text-sm font-semibold">{name}</p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {identity.email}
                </p>
              </div>
              {showProfile ? (
                <Link
                  href="/profile"
                  onClick={() => setOpen(false)}
                  className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-3"
                >
                  <UserRound aria-hidden="true" className="size-4" />
                  {t("dashboard.nav.profile")}
                </Link>
              ) : null}
              {adminAccess?.isAdmin ? (
                <Link
                  href="/admin"
                  onClick={() => setOpen(false)}
                  className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-3"
                >
                  <ShieldCheck aria-hidden="true" className="size-4" />
                  {t("admin.nav.console")}
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  void i18n.changeLanguage(
                    i18n.resolvedLanguage === "he" ? "en" : "he",
                  );
                }}
                className="hover:bg-muted focus-visible:ring-ring/40 flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 text-sm outline-none focus-visible:ring-3"
              >
                <Languages aria-hidden="true" className="size-4" />
                {t("language.otherLanguage")}
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring/40 mt-1 flex min-h-10 w-full items-center gap-2.5 rounded-lg border-t px-3 text-sm outline-none focus-visible:ring-3 disabled:opacity-60"
              >
                {signingOut ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <LogOut aria-hidden="true" className="size-4" />
                )}
                {t("auth.signOut")}
              </button>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {signOutError ? (
        <p
          role="alert"
          className="bg-popover text-destructive border-border fixed inset-x-4 bottom-6 z-[70] mx-auto max-w-sm rounded-xl border px-4 py-3 text-center text-sm font-medium shadow-xl"
        >
          {t("auth.signOutError")}
        </p>
      ) : null}
    </>
  );
}
