import { catalogLabel } from "./profile-types";
import { useDeferredValue, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { SharedPicker, type PickerOption } from "./reference-multi-select";

function termKey(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function ExperienceDomainsPicker({
  values,
  onChange,
  error,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
}) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const results = useQuery(api.referenceData.searchCatalog, {
    kind: "experienceDomain",
    search: deferredSearch,
  });
  const addCustom = useMutation(api.referenceData.addCustomCatalogItem);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const pickerValue = (label: string, isCustom = false): PickerOption => ({
    id: termKey(label),
    label,
    isCustom,
  });
  return (
    <SharedPicker
      label={t("onboarding.fields.experienceDomains")}
      placeholder={t("onboarding.placeholders.experienceDomain")}
      values={values.map((label) => pickerValue(label))}
      results={results?.map((option) =>
        pickerValue(catalogLabel(option, i18n.language), option.isCustom),
      )}
      search={search}
      setSearch={(next) => {
        setSearch(next);
        setCreateError(null);
      }}
      onChange={(next) => onChange(next.map((item) => item.label))}
      onCreate={async (label) => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        setIsCreating(true);
        setCreateError(null);
        try {
          const created = await addCustom({
            kind: "experienceDomain",
            label,
            locale: i18n.language.startsWith("he") ? "he" : "en",
          });
          const savedLabel = catalogLabel(created, i18n.language);
          if (!values.some((value) => termKey(value) === termKey(savedLabel)))
            onChange([...values, savedLabel]);
          setSearch("");
        } catch {
          setCreateError(t("onboarding.errors.addCustom"));
        } finally {
          creatingRef.current = false;
          setIsCreating(false);
        }
      }}
      isCreating={isCreating}
      maxItems={20}
      error={error}
      createError={createError}
    />
  );
}
