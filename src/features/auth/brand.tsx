import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Brand() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-xl shadow-sm">
        <Sparkles aria-hidden="true" className="size-4" />
      </span>
      <span>{t("brand.name")}</span>
    </div>
  );
}
