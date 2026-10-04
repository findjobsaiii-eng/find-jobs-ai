import type { CueName } from "uisfx";

export function interactionCue(target: EventTarget | null): CueName | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('[data-ui-sound="off"], .marketing-video-frame'))
    return null;
  const control = target.closest(
    'button, a[href], [role="button"], [role="tab"], [role="checkbox"], [role="switch"], input[type="checkbox"], input[type="radio"], summary',
  );
  if (
    !control ||
    control.closest('[disabled], [aria-disabled="true"], [inert]')
  )
    return null;
  if (control.matches("a[href]")) return "forward";
  const checked = control.getAttribute("aria-checked");
  if (checked !== null) return checked === "true" ? "toggle-off" : "toggle-on";
  if (control instanceof HTMLInputElement)
    return control.checked ? "toggle-on" : "toggle-off";
  if (control.getAttribute("role") === "tab") return "select";
  const expanded = control.getAttribute("aria-expanded");
  if (expanded !== null) return expanded === "true" ? "close" : "open";
  return "press";
}
