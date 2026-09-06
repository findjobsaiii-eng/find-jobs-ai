const OAUTH_ATTEMPT_KEY = "find-jobs-ai:oauth-attempt-pending";

export function getOAuthCallbackCode(search: string) {
  const code = new URLSearchParams(search).get("code")?.trim();
  return code ? code : null;
}

export function removeOAuthCallbackCode(location: Location) {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function markOAuthAttemptPending(storage: Storage) {
  storage.setItem(OAUTH_ATTEMPT_KEY, "1");
}

export function clearOAuthAttemptPending(storage: Storage) {
  storage.removeItem(OAUTH_ATTEMPT_KEY);
}

export function hasOAuthAttemptPending(storage: Storage) {
  return storage.getItem(OAUTH_ATTEMPT_KEY) === "1";
}
