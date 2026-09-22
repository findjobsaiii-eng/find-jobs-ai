"use client";

import { useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/auth-shell";

type TestStatus = "idle" | "sending" | "sent" | "failed" | "unconfigured";

export default function SentryTestPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<TestStatus>("idle");
  const [eventId, setEventId] = useState<string | null>(null);

  async function sendTestError() {
    if (!Sentry.getClient()) {
      setStatus("unconfigured");
      return;
    }

    setStatus("sending");

    try {
      throw new Error("JOBMITER Sentry test error");
    } catch (error) {
      const id = Sentry.captureException(error);
      const delivered = await Sentry.flush(5000);
      setEventId(id);
      setStatus(delivered ? "sent" : "failed");
    }
  }

  return (
    <AuthShell>
      <section
        className="w-full max-w-md text-center"
        aria-labelledby="sentry-test-title"
      >
        <h1 id="sentry-test-title" className="text-3xl font-semibold">
          {t("sentryTest.title")}
        </h1>
        <p className="text-muted-foreground mt-3 leading-7">
          {t("sentryTest.description")}
        </p>
        <Button
          className="mt-6"
          onClick={() => void sendTestError()}
          disabled={status === "sending" || status === "sent"}
        >
          {status === "sending"
            ? t("sentryTest.sending")
            : t("sentryTest.send")}
        </Button>
        {status !== "idle" && status !== "sending" ? (
          <p className="text-muted-foreground mt-4" role="status">
            {t(`sentryTest.${status}`)}
            {eventId ? ` ${eventId}` : null}
          </p>
        ) : null}
      </section>
    </AuthShell>
  );
}
