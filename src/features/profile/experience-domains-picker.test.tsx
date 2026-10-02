import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import i18n, { initializeI18n } from "@/i18n";
import { ExperienceDomainsPicker } from "./experience-domains-picker";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  results: [
    {
      id: "insurance",
      labelEn: "Insurance",
      labelHe: "ביטוח",
      isCustom: false,
    },
  ],
}));
vi.mock("convex/react", () => ({
  useQuery: () => mocks.results,
  useMutation: () => mocks.create,
}));
function Harness() {
  const [values, setValues] = useState([
    "Software development and insurance customer service",
  ]);
  return (
    <>
      <ExperienceDomainsPicker values={values} onChange={setValues} />
      <output data-testid="selection">{JSON.stringify(values)}</output>
    </>
  );
}
beforeAll(async () => {
  await initializeI18n();
});
beforeEach(async () => {
  await i18n.changeLanguage("en");
  mocks.create.mockReset();
});
it("removes a CV area and selects a database suggestion with the keyboard", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(
    screen.getByRole("button", {
      name: "Remove Software development and insurance customer service",
    }),
  );
  const input = screen.getByRole("combobox", { name: "Experience areas" });
  await user.click(input);
  await user.keyboard("{ArrowDown}{Enter}");
  expect(screen.getByTestId("selection")).toHaveTextContent('["Insurance"]');
});
it("creates a multiword custom area and retains selections when creation fails", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const input = screen.getByRole("combobox", { name: "Experience areas" });
  mocks.create.mockRejectedValueOnce(new Error("network"));
  await user.type(input, "Marine insurance operations");
  await user.click(
    screen.getByRole("option", { name: /Marine insurance operations/ }),
  );
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(
    screen.getByText("Software development and insurance customer service"),
  ).toBeInTheDocument();
  mocks.create.mockResolvedValueOnce({
    id: "custom",
    labelEn: "Marine insurance operations",
    labelHe: null,
    isCustom: true,
  });
  await user.click(screen.getByRole("combobox", { name: "Experience areas" }));
  await user.click(
    screen.getByRole("option", { name: /Marine insurance operations/ }),
  );
  expect(mocks.create).toHaveBeenLastCalledWith({
    kind: "experienceDomain",
    label: "Marine insurance operations",
    locale: "en",
  });
  expect(
    await screen.findByText("Marine insurance operations"),
  ).toBeInTheDocument();
});
it("uses Hebrew suggestions without changing existing CV labels", async () => {
  await i18n.changeLanguage("he");
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("combobox", { name: "תחומי ניסיון" }));
  await user.click(screen.getByRole("option", { name: "ביטוח" }));
  expect(screen.getByText("ביטוח")).toBeInTheDocument();
  expect(
    screen.getByText("Software development and insurance customer service"),
  ).toBeInTheDocument();
});
it("keeps selected areas when Escape is pressed in a closed picker", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.tab();
  expect(
    screen.getByRole("combobox", { name: "Experience areas" }),
  ).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.getByTestId("selection")).toHaveTextContent(
    '["Software development and insurance customer service"]',
  );
});
