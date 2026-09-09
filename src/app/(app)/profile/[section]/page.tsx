import { notFound, redirect } from "next/navigation";
import { ProfileRoute } from "@/features/dashboard/app-routes";
import { isProfileSection } from "@/features/profile/profile-section";

type ProfileSectionPageProps = {
  params: Promise<{ section: string }>;
};

export default async function ProfileSectionPage({
  params,
}: ProfileSectionPageProps) {
  const { section } = await params;

  if (section === "professional" || section === "edit") {
    redirect("/profile");
  }

  if (!isProfileSection(section)) {
    notFound();
  }

  return <ProfileRoute section={section} />;
}
