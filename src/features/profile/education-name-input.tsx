import { useDeferredValue, useId } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useQuery } from "convex/react";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";

type Option = { id: string; label: string; custom?: boolean };
export function EducationNameInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const search = useDeferredValue(value);
  const results = useQuery(api.referenceIdentity.searchEducation, { search });
  const options: Option[] = (results ?? []).map((item) => ({
    id: item.id,
    label: i18n.language.startsWith("he") ? item.labelHe : item.labelEn,
  }));
  if (
    value.trim() &&
    !options.some(
      (item) => item.label.toLowerCase() === value.trim().toLowerCase(),
    )
  )
    options.push({ id: "custom", label: value.trim(), custom: true });
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {t("qualifications.credential")}
      </label>
      <Combobox.Root<Option>
        items={options}
        filter={null}
        inputValue={value}
        itemToStringLabel={(item) => item.label}
        onInputValueChange={(next, details) => {
          // This is free text as well as a selector. The combobox's default
          // blur reset must not erase a name that is outside the catalog.
          if (details.reason === "input-change") onChange(next);
        }}
        onValueChange={(item) => {
          if (item) onChange(item.label);
        }}
      >
        <Combobox.InputGroup className="border-input bg-background focus-within:border-ring focus-within:ring-ring/30 flex min-h-11 rounded-xl border transition-shadow focus-within:ring-3">
          <Combobox.Input
            id={id}
            maxLength={160}
            placeholder={t("qualifications.credentialPlaceholder")}
            className="placeholder:text-muted-foreground w-full min-w-0 flex-1 rounded-xl bg-transparent px-3 py-2 text-sm outline-none"
          />
          <Combobox.Trigger
            aria-label={t("qualifications.browse")}
            className="text-muted-foreground focus-visible:ring-ring rounded-xl px-3 outline-none focus-visible:ring-2"
          >
            <ChevronsUpDown aria-hidden="true" className="size-4" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner className="z-50 outline-none" sideOffset={6}>
            <Combobox.Popup className="bg-popover text-popover-foreground border-border max-h-[min(18rem,var(--available-height))] w-[var(--anchor-width)] overflow-auto rounded-xl border p-1.5 shadow-lg">
              <Combobox.Empty className="text-muted-foreground px-3 py-2 text-sm">
                {results === undefined
                  ? t("onboarding.searching")
                  : t("qualifications.enterName")}
              </Combobox.Empty>
              <Combobox.List>
                {(item: Option) => (
                  <Combobox.Item
                    key={item.id}
                    value={item}
                    className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex min-h-10 cursor-default items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none"
                  >
                    {item.custom ? (
                      <Plus aria-hidden="true" className="size-4" />
                    ) : null}
                    <span>
                      {item.custom
                        ? t("onboarding.addMissing", { value: item.label })
                        : item.label}
                    </span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  );
}
