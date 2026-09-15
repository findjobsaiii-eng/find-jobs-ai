import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Brand } from "./brand";
import { LanguageButton } from "./language-button";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="bg-brand-snow relative isolate flex min-h-svh overflow-hidden px-5 py-6 text-start sm:px-8 sm:py-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-[34rem] max-w-5xl bg-[radial-gradient(circle_at_top,var(--color-brand-glow),transparent_68%)]"
      />
      <div
        aria-hidden="true"
        className="bg-brand-midnight absolute inset-x-0 top-0 -z-20 h-44"
      />
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between rounded-2xl bg-white/90 px-3 py-2 shadow-[var(--brand-shadow-card)] backdrop-blur sm:px-4">
          <Brand />
          <LanguageButton />
        </header>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 items-center justify-center py-12"
        >
          {children}
        </motion.div>
      </div>
    </main>
  );
}
