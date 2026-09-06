import { useDeferredValue, useId, useRef, useState } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { useMutation, useQuery } from "convex/react";
import { Check, LoaderCircle, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import type { CatalogOption, LocationOption } from "./profile-types";

type PickerOption = {
  id: string;
  label: string;
  isCustom: boolean;
  create?: boolean;
  kindLabel?: string;
};

type SharedPickerProps = {
  label: string;
  hint?: string;
  placeholder: string;
  values: PickerOption[];
  results: PickerOption[] | undefined;
  search: string;
  setSearch: (search: string) => void;
  onChange: (values: PickerOption[]) => void;
  onCreate?: (label: string) => Promise<void>;
  isCreating?: boolean;
  maxItems: number;
  error?: string;
  createError?: string | null;
};

function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

function SharedPicker({
  label,
  hint,
  placeholder,
  values,
  results,
  search,
  setSearch,
  onChange,
  onCreate,
  isCreating = false,
  maxItems,
  error,
  createError,
}: SharedPickerProps) {
  const { t } = useTranslation();
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const trimmedSearch = search.trim();
  const exactMatch = [...values, ...(results ?? [])].some(
    (item) => normalize(item.label) === normalize(trimmedSearch),
  );
  const createOption: PickerOption | null =
    onCreate &&
    trimmedSearch &&
    !exactMatch &&
    values.length < maxItems &&
    results !== undefined
      ? {
          id: "__create__",
          label: trimmedSearch,
          isCustom: true,
          create: true,
        }
      : null;
  const uniqueItems = new Map<string, PickerOption>();
  for (const item of values) uniqueItems.set(item.id, item);
  for (const item of results ?? []) uniqueItems.set(item.id, item);
  if (createOption) uniqueItems.set(createOption.id, createOption);
  const items = [...uniqueItems.values()];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-muted-foreground text-xs tabular-nums">
          {values.length}/{maxItems}
        </span>
      </div>
      <Combobox.Root
        items={items}
        multiple
        value={values}
        inputValue={search}
        filter={null}
        itemToStringLabel={(item) => item.label}
        isItemEqualToValue={(item, value) => item.id === value.id}
        onInputValueChange={setSearch}
        onValueChange={(nextValues) => {
          const create = nextValues.find((item) => item.create);
          if (create && onCreate) {
            void onCreate(create.label);
            return;
          }
          onChange(nextValues.slice(0, maxItems));
          setSearch("");
        }}
      >
        <Combobox.InputGroup
          className={cn(
            "border-input bg-background focus-within:border-ring focus-within:ring-ring/30 flex min-h-12 w-full cursor-text flex-wrap items-center gap-1.5 rounded-xl border px-2.5 py-2 transition-shadow focus-within:ring-3",
            error && "border-destructive",
          )}
        >
          <Combobox.Chips className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <Combobox.Value>
              {(selected: PickerOption[]) => (
                <>
                  {selected.map((item) => (
                    <Combobox.Chip
                      key={item.id}
                      aria-label={item.label}
                      className="bg-primary/10 text-primary focus-within:ring-ring/40 inline-flex min-h-7 max-w-full items-center gap-1 rounded-lg ps-2.5 pe-1 text-sm outline-none focus-within:ring-2"
                    >
                      <span className="truncate">{item.label}</span>
                      {item.isCustom ? (
                        <span className="text-primary/70 text-[10px] font-medium">
                          {t("onboarding.custom")}
                        </span>
                      ) : null}
                      <Combobox.ChipRemove
                        className="hover:bg-primary/10 focus-visible:ring-ring/40 grid size-6 shrink-0 place-items-center rounded-md outline-none focus-visible:ring-2"
                        aria-label={t("onboarding.removeItem", {
                          item: item.label,
                        })}
                      >
                        <X aria-hidden="true" className="size-3.5" />
                      </Combobox.ChipRemove>
                    </Combobox.Chip>
                  ))}
                  <span className="flex min-w-28 flex-1 items-center">
                    <Combobox.Input
                      id={id}
                      placeholder={values.length ? "" : placeholder}
                      disabled={isCreating || values.length >= maxItems}
                      aria-invalid={Boolean(error)}
                      aria-describedby={
                        error
                          ? `${hint ? hintId : ""} ${errorId}`
                          : hint
                            ? hintId
                            : undefined
                      }
                      className="placeholder:text-muted-foreground h-7 min-w-24 flex-1 border-0 bg-transparent px-1 text-sm outline-none disabled:cursor-not-allowed"
                    />
                    {results === undefined || isCreating ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="text-muted-foreground size-4 animate-spin"
                      />
                    ) : null}
                  </span>
                </>
              )}
            </Combobox.Value>
          </Combobox.Chips>
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner className="z-50 outline-none" sideOffset={6}>
            <Combobox.Popup className="bg-popover text-popover-foreground border-border max-h-[min(22rem,var(--available-height))] w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-lg transition-[transform,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
              <Combobox.Empty className="text-muted-foreground px-3 py-4 text-center text-sm">
                {results === undefined
                  ? t("onboarding.searching")
                  : t("onboarding.noOptions")}
              </Combobox.Empty>
              <Combobox.List>
                {(item: PickerOption) => (
                  <Combobox.Item
                    key={item.id}
                    value={item}
                    className="data-highlighted:bg-accent data-highlighted:text-accent-foreground flex min-h-10 cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none"
                  >
                    {item.create ? (
                      <Plus aria-hidden="true" className="size-4 shrink-0" />
                    ) : (
                      <Combobox.ItemIndicator className="grid size-4 shrink-0 place-items-center">
                        <Check aria-hidden="true" className="size-4" />
                      </Combobox.ItemIndicator>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {item.create
                        ? t("onboarding.addMissing", { value: item.label })
                        : item.label}
                    </span>
                    {item.kindLabel ? (
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {item.kindLabel}
                      </span>
                    ) : null}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {hint ? (
        <p id={hintId} className="text-muted-foreground mt-1.5 text-xs">
          {hint}
        </p>
      ) : null}
      {error || createError ? (
        <p id={errorId} className="text-destructive mt-1 text-sm" role="alert">
          {error ?? createError}
        </p>
      ) : null}
    </div>
  );
}

function catalogLabel(option: CatalogOption, language: string): string {
  return (
    (language === "he" ? option.labelHe : option.labelEn) ??
    option.labelEn ??
    option.labelHe ??
    ""
  );
}

export function CatalogMultiSelect({
  kind,
  label,
  hint,
  placeholder,
  values,
  onChange,
  maxItems,
  error,
}: {
  kind: "jobTitle" | "skill";
  label: string;
  hint?: string;
  placeholder: string;
  values: CatalogOption[];
  onChange: (values: CatalogOption[]) => void;
  maxItems: number;
  error?: string;
}) {
  const { i18n, t } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const results = useQuery(api.referenceData.searchCatalog, {
    kind,
    search: deferredSearch,
  });
  const addCustom = useMutation(api.referenceData.addCustomCatalogItem);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const toPicker = (option: CatalogOption): PickerOption => ({
    id: option.id,
    label: catalogLabel(option, i18n.language),
    isCustom: option.isCustom,
  });
  const byId = new Map(values.map((option) => [option.id, option]));

  return (
    <SharedPicker
      label={label}
      hint={hint}
      placeholder={placeholder}
      values={values.map(toPicker)}
      results={results?.map(toPicker)}
      search={search}
      setSearch={(next) => {
        setCreateError(null);
        setSearch(next);
      }}
      onChange={(next) =>
        onChange(
          next.flatMap((item) => {
            const existing =
              byId.get(item.id as CatalogOption["id"]) ??
              results?.find((option) => option.id === item.id);
            return existing ? [existing] : [];
          }),
        )
      }
      onCreate={async (value) => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        setIsCreating(true);
        setCreateError(null);
        try {
          const created = await addCustom({
            kind,
            label: value,
            locale: i18n.language === "he" ? "he" : "en",
          });
          if (!values.some((item) => item.id === created.id)) {
            onChange([...values, created]);
          }
          setSearch("");
        } catch {
          setCreateError(t("onboarding.errors.addCustom"));
        } finally {
          creatingRef.current = false;
          setIsCreating(false);
        }
      }}
      isCreating={isCreating}
      maxItems={maxItems}
      error={error}
      createError={createError}
    />
  );
}

export function LocationMultiSelect({
  label,
  hint,
  placeholder,
  values,
  onChange,
  maxItems,
  error,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  values: LocationOption[];
  onChange: (values: LocationOption[]) => void;
  maxItems: number;
  error?: string;
}) {
  const { i18n, t } = useTranslation();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const results = useQuery(api.referenceData.searchLocations, {
    search: deferredSearch,
  });
  const toPicker = (option: LocationOption): PickerOption => ({
    id: option.code,
    label:
      (i18n.language === "he" ? option.nameHe : option.nameEn) ?? option.nameHe,
    isCustom: false,
    kindLabel: t(`onboarding.locationKinds.${option.kind}`),
  });
  const byId = new Map(values.map((option) => [option.code, option]));

  return (
    <SharedPicker
      label={label}
      hint={hint}
      placeholder={placeholder}
      values={values.map(toPicker)}
      results={results?.map(toPicker)}
      search={search}
      setSearch={setSearch}
      onChange={(next) =>
        onChange(
          next.flatMap((item) => {
            const existing =
              byId.get(item.id) ??
              results?.find((option) => option.code === item.id);
            return existing ? [existing] : [];
          }),
        )
      }
      maxItems={maxItems}
      error={error}
    />
  );
}
