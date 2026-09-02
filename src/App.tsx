import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { AuthenticatedHome } from "@/features/auth/authenticated-home";
import { AuthLoadingScreen } from "@/features/auth/auth-loading-screen";
import { SignInScreen } from "@/features/auth/sign-in-screen";

export default function App() {
  return (
    <>
      <AuthLoading>
        <AuthLoadingScreen />
      </AuthLoading>
      <Unauthenticated>
        <SignInScreen />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedHome />
      </Authenticated>
    </>
  );
}
