import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import convexPlugin from "@convex-dev/eslint-plugin";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["convex/**/*.{ts,tsx}"],
    rules: {
      "import/no-anonymous-default-export": "off",
    },
  },
  {
    files: ["src/app/opengraph-image.tsx"],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  ...convexPlugin.configs.recommended,
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "dist/**",
    "convex/_generated/**",
    "next-env.d.ts",
  ]),
]);
