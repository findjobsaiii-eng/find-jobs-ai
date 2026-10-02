import type { CandidateQualifications } from "../../../convex/candidateQualifications";
import { educationFieldKeys } from "../../../convex/educationIdentity";

/** Keep the CV's study field visible when it adds meaning to an abbreviated credential. */
export function educationDisplayName(
  entry: CandidateQualifications["education"][number],
) {
  const field = entry.field?.trim() ?? "";
  // Once edited, the name is the raw input value. Keep trailing spaces while
  // typing; the server normalizes whitespace when the profile is saved.
  if (!field) return entry.credential ?? "";
  const credential = entry.credential?.trim() ?? "";
  if (!credential) return field;
  if (!field || credential.toLowerCase().includes(field.toLowerCase()))
    return credential;
  const fieldKeys = educationFieldKeys(field);
  const credentialKeys = educationFieldKeys(credential);
  if (
    credentialKeys.length &&
    /^(?:tech|technology|טכנולוגיה|טכנולוגי)$/iu.test(field)
  )
    return credential;
  if (fieldKeys.length === 1 && credentialKeys.includes(fieldKeys[0]))
    return credential;
  return credential + " · " + field;
}
