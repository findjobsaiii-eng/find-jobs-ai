"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CurrentProfile } from "./profile-types";

const ProfileContext = createContext<CurrentProfile | null>(null);

export function ProfileProvider({
  data,
  children,
}: {
  data: CurrentProfile;
  children: ReactNode;
}) {
  return (
    <ProfileContext.Provider value={data}>{children}</ProfileContext.Provider>
  );
}

export function useCurrentProfile() {
  const data = useContext(ProfileContext);
  if (!data) {
    throw new Error("useCurrentProfile must be used within ProfileProvider");
  }
  return data;
}
