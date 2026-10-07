"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  captureBoundaryError,
  recoverBoundaryError,
} from "@/lib/sentry-errors";
import en from "@/i18n/locales/en.json";
import he from "@/i18n/locales/he.json";

// The root layout (including i18n/auth/theme providers) can itself have failed.
function language() {
  try {
    return localStorage.getItem("i18nextLng") === "en" ? "en" : "he";
  } catch {
    return "he";
  }
}
const subscribe = () => () => {};
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const lang = useSyncExternalStore(subscribe, language, () => "he");
  const copy = lang === "en" ? en.errors : he.errors;
  useEffect(() => {
    captureBoundaryError(error, "root-layout");
  }, [error]);
  return (
    <html lang={lang} dir={lang === "he" ? "rtl" : "ltr"}>
      <head>
        <title>{copy.title}</title>
      </head>
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, sans-serif",
          background: "Canvas",
          color: "CanvasText",
        }}
      >
        <main
          style={{
            minHeight: "100svh",
            display: "grid",
            placeItems: "center",
            padding: "1.5rem",
            boxSizing: "border-box",
          }}
        >
          <section
            style={{ maxWidth: "28rem", textAlign: "center" }}
            aria-labelledby="global-error-title"
          >
            <h1 id="global-error-title">{copy.title}</h1>
            <p style={{ lineHeight: 1.7 }}>{copy.description}</p>
            <button
              type="button"
              onClick={() => recoverBoundaryError(error, retry)}
              style={{
                padding: "0.75rem 1.25rem",
                marginTop: "1rem",
                border: "1px solid currentColor",
                borderRadius: "0.75rem",
                background: "transparent",
                color: "inherit",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              {copy.retry}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
