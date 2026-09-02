import { ArrowUpRight, Languages, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export default function App() {
  const { i18n, t } = useTranslation();
  const isHebrew = i18n.resolvedLanguage === "he";

  const toggleLanguage = () => {
    void i18n.changeLanguage(isHebrew ? "en" : "he");
  };

  return (
    <main className="bg-background relative isolate flex min-h-svh items-center overflow-hidden px-5 py-12 text-start sm:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-96 max-w-5xl bg-[radial-gradient(circle_at_top,var(--color-brand-glow),transparent_68%)]"
      />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto w-full max-w-3xl"
      >
        <header className="mb-20 flex items-center justify-between sm:mb-28">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-xl shadow-sm">
              <Sparkles aria-hidden="true" className="size-4" />
            </span>
            <span>{t("brand.name")}</span>
          </div>

          <Button
            variant="ghost"
            onClick={toggleLanguage}
            aria-label={t("language.switchLabel")}
          >
            <Languages aria-hidden="true" data-icon="inline-start" />
            {t("language.otherLanguage")}
          </Button>
        </header>

        <div className="max-w-2xl">
          <p className="bg-card text-muted-foreground mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-xs">
            <span
              aria-hidden="true"
              className="bg-primary size-1.5 rounded-full"
            />
            {t("foundation.eyebrow")}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl sm:leading-[1.08]">
            {t("foundation.title")}
          </h1>
          <p className="text-muted-foreground mt-6 max-w-xl text-base leading-7 text-pretty sm:text-lg sm:leading-8">
            {t("foundation.description")}
          </p>

          <div className="text-primary mt-10 flex items-center gap-2 text-sm font-medium">
            <span>{t("foundation.status")}</span>
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 rtl:-scale-x-100"
            />
          </div>
        </div>
      </motion.section>
    </main>
  );
}
