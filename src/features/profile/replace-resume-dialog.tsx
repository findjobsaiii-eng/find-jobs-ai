import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function ReplaceResumeDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("onboarding.replaceResume.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("onboarding.replaceResume.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" nativeButton render={<AlertDialogClose />}>
            {t("onboarding.replaceResume.cancel")}
          </Button>
          <Button
            type="button"
            nativeButton
            render={<AlertDialogClose />}
            onClick={onConfirm}
          >
            {t("onboarding.replaceResume.confirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
