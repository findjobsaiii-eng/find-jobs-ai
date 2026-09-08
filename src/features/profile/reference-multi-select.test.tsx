import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import type { CatalogOption } from "./profile-types";
import { CatalogMultiSelect } from "./reference-multi-select";

const catalog = vi.hoisted(() => ({
  results: [] as CatalogOption[],
}));

vi.mock("convex/react", () => ({
  useQuery: () => catalog.results,
  useMutation: () => vi.fn(),
}));

function option(id: string, label: string): CatalogOption {
  return {
    id,
    labelEn: label,
    labelHe: label,
    isCustom: false,
  } as CatalogOption;
}

function PickerHarness({
  initialValues,
  maxItems,
}: {
  initialValues: CatalogOption[];
  maxItems: number;
}) {
  const [values, setValues] = useState(initialValues);
  return (
    <CatalogMultiSelect
      kind="jobTitle"
      label="Target roles"
      placeholder="Search roles"
      values={values}
      onChange={setValues}
      maxItems={maxItems}
    />
  );
}

describe("catalog multi-select", () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  beforeEach(async () => {
    await i18n.changeLanguage("en");
    catalog.results = [];
  });

  it("keeps selected values in chips and removes them from the option list", async () => {
    const frontend = option("role-frontend", "Frontend Developer");
    const backend = option("role-backend", "Backend Developer");
    catalog.results = [frontend, backend];
    const user = userEvent.setup();
    render(<PickerHarness initialValues={[frontend]} maxItems={5} />);

    await user.click(screen.getByRole("combobox", { name: "Target roles" }));

    expect(
      screen.queryByRole("option", { name: "Frontend Developer" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Backend Developer" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveClass("py-4");
  });

  it("keeps the menu discoverable at capacity and visibly locks more options", async () => {
    const frontend = option("role-frontend", "Frontend Developer");
    const backend = option("role-backend", "Backend Developer");
    const product = option("role-product", "Product Manager");
    catalog.results = [frontend, backend, product];
    const user = userEvent.setup();
    render(<PickerHarness initialValues={[frontend, backend]} maxItems={2} />);

    const input = screen.getByRole("combobox", { name: "Target roles" });
    expect(input).toBeEnabled();
    expect(screen.getByLabelText("2 of 2 selected")).toBeInTheDocument();
    await user.click(input);

    expect(
      screen.getByRole("option", { name: "Product Manager" }),
    ).toHaveAttribute("aria-disabled", "true");
  });
});
