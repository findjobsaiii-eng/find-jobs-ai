import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  class TestIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds = [0];

    disconnect() {
      return undefined;
    }
    observe() {
      return undefined;
    }
    takeRecords() {
      return [];
    }
    unobserve() {
      return undefined;
    }
  }

  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
}

afterEach(() => {
  cleanup();

  if (typeof window !== "undefined") {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
    window.history?.replaceState(null, "", "/");
  }
});
