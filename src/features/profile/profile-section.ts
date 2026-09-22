import type { EditableProfileSection } from "./profile-editor";

export type ProfileSection = EditableProfileSection | "resumes" | "emails";

export const PROFILE_SECTION_IDS: readonly ProfileSection[] = [
  "professional",
  "preferences",
  "languages",
  "resumes",
  "emails",
];

export function isProfileSection(value: string): value is ProfileSection {
  return PROFILE_SECTION_IDS.includes(value as ProfileSection);
}

export function profileSectionHref(section: ProfileSection) {
  return section === "professional" ? "/profile" : `/profile/${section}`;
}
