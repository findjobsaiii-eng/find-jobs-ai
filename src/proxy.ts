import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

function isProviderOAuthRoute(pathname: string) {
  return (
    pathname.startsWith("/api/auth/signin/") ||
    pathname.startsWith("/api/auth/callback/")
  );
}

// The provider-facing GET routes are rewritten to Convex after this proxy runs.
// Only the resulting app callback (for example `/?code=...`) is exchanged here.
export const proxy = convexAuthNextjsMiddleware(undefined, {
  shouldHandleCode: (request) =>
    !isProviderOAuthRoute(request.nextUrl.pathname),
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api)(.*)"],
};
