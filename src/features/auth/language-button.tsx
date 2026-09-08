import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function LanguageButton({
  compactOnMobile = false,
}: {
  compactOnMobile?: boolean;
}) {
  const { i18n, t } = useTranslation();
  const isHebrew = i18n.resolvedLanguage === "he";

  const toggleLanguage = () => {
    void i18n.changeLanguage(isHebrew ? "en" : "he");
  };

  return (
    <Button
      variant="ghost"
      onClick={toggleLanguage}
      aria-label={t("language.switchLabel")}
    >
      <Languages aria-hidden="true" data-icon="inline-start" />
      <span className={compactOnMobile ? "hidden sm:inline" : undefined}>
        {t("language.otherLanguage")}
      </span>
    </Button>
  );
}
