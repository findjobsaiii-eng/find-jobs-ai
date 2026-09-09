"use client";

import { useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";
import {
  clearOAuthAttemptPending,
  getOAuthReturnUrl,
  markOAuthAttemptPending,
} from "./oauth-callback";

export function useGoogleSignIn() {
  const { t } = useTranslation();
  const { signIn } = useAuthActions();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);
    markOAuthAttemptPending(window.sessionStorage);

    try {
      await signIn("google", {
        redirectTo: getOAuthReturnUrl(window.location),
      });
    } catch {
      clearOAuthAttemptPending(window.sessionStorage);
      submittingRef.current = false;
      setError(t("auth.error"));
      setIsSubmitting(false);
    }
  };

  return { error, isSubmitting, signInWithGoogle };
}
