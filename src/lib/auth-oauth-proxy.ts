const FIRST_PARTY_OAUTH_COOKIES = new Set([
  "__Host-googleOAuthpkce",
  "__Host-googleOAuthstate",
  "__Host-googleOAuthnonce",
  "__Host-googleRedirectTo",
]);

export function normalizeFirstPartyOAuthCookie(cookie: string) {
  const cookieName = cookie.slice(0, cookie.indexOf("="));
  if (!FIRST_PARTY_OAUTH_COOKIES.has(cookieName)) return cookie;

  return cookie
    .replace(/;\s*Partitioned/giu, "")
    .replace(/;\s*SameSite=None/giu, "; SameSite=Lax");
}

export function isAllowedOAuthProxyPath(path: string[]) {
  return (
    path.length === 2 &&
    (path[0] === "signin" || path[0] === "callback") &&
    path[1] === "google"
  );
}
