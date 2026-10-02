import { EDUCATION_CATALOG_SEED } from "./educationCatalogData";
import {
  fieldKeysFromCatalog,
  identityTermKey,
  normalizeEducationTerm,
  type IdentityCatalog,
} from "./referenceIdentityModel";

// Bootstrap identity for pure formatting/tests. Runtime matching supplies its DB catalog.
const bootstrap: IdentityCatalog = {
  skills: {},
  fields: {},
  qualifications: {},
};
for (const item of EDUCATION_CATALOG_SEED) {
  const target =
    item.kind === "field" ? bootstrap.fields : bootstrap.qualifications;
  for (const alias of [item.labelEn, item.labelHe, ...item.aliases])
    target[identityTermKey(normalizeEducationTerm(alias))] = item.key;
}
export function educationFieldKeys(...values: Array<string | null>) {
  return fieldKeysFromCatalog(bootstrap, ...values);
}
export function matchingEducationFieldKeys(
  catalog: IdentityCatalog | undefined,
  ...values: Array<string | null>
) {
  return fieldKeysFromCatalog(catalog ?? bootstrap, ...values);
}
