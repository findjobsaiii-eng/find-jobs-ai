const OAUTH_ATTEMPT_KEY = "find-jobs-ai:oauth-attempt-pending";

export function getOAuthReturnUrl(location: Location) {
  const url = new URL(location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("redirectTo");
  return url.href;
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
