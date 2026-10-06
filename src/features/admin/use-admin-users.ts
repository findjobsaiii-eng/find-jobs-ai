import { useDeferredValue } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useAdminUsers(search = "") {
  const term = useDeferredValue(search.trim().slice(0, 100));
  return usePaginatedQuery(api.admin.listUsers, term ? { search: term } : {}, {
    initialNumItems: 20,
  });
}
