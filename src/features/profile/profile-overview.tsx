"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Check,
  FileText,
  Languages,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/ui/product-layout";
import { DataControls } from "@/features/privacy/data-controls";
import { cn } from "@/lib/utils";
import type { CurrentProfile } from "./profile-types";
import { ProfileEditor } from "./profile-editor";
import { ResumeLibrary } from "./resume-library";
import { DiscardProfileChangesDialog } from "./discard-profile-changes-dialog";
import { profileSectionHref, type ProfileSection } from "./profile-section";

const PROFILE_SECTIONS = [
  { id: "professional", icon: BriefcaseBusiness },
  { id: "preferences", icon: SlidersHorizontal },
  { id: "languages", icon: Languages },
  { id: "resumes", icon: FileText },
] as const;

export function ProfileOverview({
  data,
  activeSection,
}: {
  data: CurrentProfile;
  activeSection: ProfileSection;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingSection, setPendingSection] = useState<ProfileSection | null>(
    null,
  );

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setEditorDirty(dirty);
    if (dirty) setSaved(false);
  }, []);

  return (
    <div>
      <PageHeader
        title={t("profileOverview.title")}
        description={t("profileOverview.description")}
      />
      {saved ? (
        <p
          role="status"
          className="text-primary mb-4 flex items-center gap-2 text-sm"
        >
          <Check aria-hidden="true" className="size-4" />
          {t("dashboard.profileSaved")}
        </p>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label={t("profileOverview.sectionNavigation")}
          className="bg-card border-border flex gap-1 overflow-x-auto rounded-xl border p-1.5 shadow-sm lg:sticky lg:top-24 lg:flex-col lg:overflow-visible"
        >
          {PROFILE_SECTIONS.map(({ id, icon: Icon }) => (
            <Link
              key={id}
              href={profileSectionHref(id)}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={(event) => {
                if (editorDirty) {
                  event.preventDefault();
                  setPendingSection(id);
                  return;
                }
                setEditorDirty(false);
                setSaved(false);
              }}
              className={cn(
                "focus-visible:ring-ring/40 flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3",
                activeSection === id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              {t(`profileOverview.sections.${id}`)}
            </Link>
          ))}
        </nav>

        <div className="min-w-0">
          {activeSection === "professional" ||
          activeSection === "preferences" ||
          activeSection === "languages" ? (
            <ProfileEditor
              key={activeSection}
              data={data}
              section={activeSection}
              onDirtyChange={handleDirtyChange}
              onSaved={() => {
                setEditorDirty(false);
                setSaved(true);
              }}
            />
          ) : null}

          {activeSection === "resumes" ? <ResumeLibrary /> : null}
        </div>
      </div>
      <DataControls />
      <DiscardProfileChangesDialog
        open={pendingSection !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSection(null);
        }}
        onDiscard={() => {
          if (!pendingSection) return;
          setEditorDirty(false);
          setSaved(false);
          router.push(profileSectionHref(pendingSection));
          setPendingSection(null);
        }}
      />
    </div>
  );
}
