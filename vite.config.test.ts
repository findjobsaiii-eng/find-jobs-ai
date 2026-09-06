// @vitest-environment node

import { describe, expect, it } from "vitest";
import config from "./vite.config";

describe("Vite development server configuration", () => {
  it("keeps the local OAuth origin fixed on port 5173", () => {
    expect(config).toBeTypeOf("object");

    if (typeof config !== "object") {
      throw new Error("Expected a static Vite configuration");
    }

    expect(config.server).toMatchObject({
      port: 5173,
      strictPort: true,
    });
  });
});
