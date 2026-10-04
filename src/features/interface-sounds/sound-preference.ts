export const SOUND_PREFERENCE_KEY = "jobmiter:interface-sounds";
const CHANGE_EVENT = "jobmiter:sound-preference-change";
let enabledInMemory = true;

export function getSoundEnabled() {
  try {
    const saved = window.localStorage.getItem(SOUND_PREFERENCE_KEY);
    return saved === null ? enabledInMemory : saved !== "off";
  } catch {
    return enabledInMemory;
  }
}

export function setSoundEnabled(enabled: boolean) {
  enabledInMemory = enabled;
  try {
    window.localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? "on" : "off");
  } catch {
    // Private browsing can deny storage; the choice still applies this session.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeSoundPreference(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SOUND_PREFERENCE_KEY || event.key === null) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
