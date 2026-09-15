import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { CurrentProfile } from "@/features/profile/profile-types";
import { Brand } from "./brand";
import { LanguageButton } from "./language-button";
import { UserMenu } from "./user-menu";

export function AuthShell({
  children,
  chrome = true,
  identity,
}: {
  children: ReactNode;
  chrome?: boolean;
  identity?: CurrentProfile["identity"];
}) {
  return (
    <main className="auth-shell-surface relative isolate flex min-h-svh overflow-hidden px-4 py-4 text-start sm:px-8 sm:py-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[34rem] max-w-5xl bg-[radial-gradient(circle_at_top,var(--color-brand-glow),transparent_68%)]"
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        {chrome ? (
          <header className="flex min-h-14 items-center justify-between px-1 sm:min-h-16">
            <Brand />
            {identity ? (
              <UserMenu identity={identity} showProfile={false} />
            ) : (
              <LanguageButton />
            )}
          </header>
        ) : null}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 items-center justify-center py-8 sm:py-12"
        >
          {children}
        </motion.div>
      </div>
    </main>
  );
}
