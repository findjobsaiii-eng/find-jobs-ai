import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { env } from "./_generated/server";
import {
  requireAuthEnvironmentValue,
  requireAuthSiteUrl,
} from "./authEnvironment";

const googleClientId = requireAuthEnvironmentValue(
  "AUTH_GOOGLE_ID",
  env.AUTH_GOOGLE_ID,
);
const googleClientSecret = requireAuthEnvironmentValue(
  "AUTH_GOOGLE_SECRET",
  env.AUTH_GOOGLE_SECRET,
);

// Convex Auth reads these values internally. Validate them before registering
// routes so a deployment with incomplete or unsafe auth configuration fails
// closed without including any configured value in the error.
requireAuthEnvironmentValue("JWKS", env.JWKS);
requireAuthEnvironmentValue("JWT_PRIVATE_KEY", env.JWT_PRIVATE_KEY);
requireAuthSiteUrl(env.SITE_URL);

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
  ],
});
