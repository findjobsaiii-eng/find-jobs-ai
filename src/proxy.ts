import { convexAuthNextjsMiddleware } from "@convex-dev/auth/nextjs/server";

// Keep OAuth verifier and session cookies on the JOBMITER origin. In
// particular, this avoids relying on a cross-site Convex callback cookie in
// browsers with strict tracking prevention, while retaining PKCE validation.
export const proxy = convexAuthNextjsMiddleware();

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api)(.*)"],
};
