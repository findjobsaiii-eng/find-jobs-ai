"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/product-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export function DataControls() {
  const { t } = useTranslation();
  const deleteAccount = useMutation(api.accountData.deleteMine);
  const { signOut } = useAuthActions();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const removeAccount = async () => {
    if (!deleteConfirmed || deleting) return;
    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteAccount({ confirmation: "DELETE" });
      try {
        await signOut();
      } catch {
        /* The deletion may have invalidated the session. */
      }
      window.location.replace("/");
    } catch {
      setDeleteError(true);
      setDeleting(false);
    }
  };

  return (
    <Surface className="mt-6">
      <h2 className="text-lg font-semibold">{t("dataControls.title")}</h2>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <a href="mailto:info@jobmiter.com?subject=JOBMITER%20data%20copy%20request" />
          }
        >
          {t("dataControls.copy")}
        </Button>
        <Button variant="outline" onClick={() => setDeleteOpen(true)}>
          {t("dataControls.delete")}
        </Button>
      </div>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>{t("dataControls.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("dataControls.deleteDescription")}
          </DialogDescription>
          <label className="mt-5 flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              checked={deleteConfirmed}
              onChange={(event) => setDeleteConfirmed(event.target.checked)}
              className="accent-primary mt-1 size-4"
            />
            <span>{t("dataControls.deleteConfirm")}</span>
          </label>
          {deleteError ? (
            <p role="alert" className="text-destructive mt-3 text-sm">
              {t("dataControls.deleteError")}
            </p>
          ) : null}
          <Button
            className="mt-5"
            disabled={!deleteConfirmed || deleting}
            onClick={() => void removeAccount()}
          >
            {t("dataControls.deleteFinal")}
          </Button>
        </DialogContent>
      </Dialog>
    </Surface>
  );
}
