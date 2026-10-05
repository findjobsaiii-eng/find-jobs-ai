import { useEffect } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useAdminUsers(search = "") {
  const result = usePaginatedQuery(
    api.admin.listUsers,
    {},
    { initialNumItems: 20 },
  );
  const { status, loadMore } = result;
  // A name/email search must also find older users outside the loaded page.
  // Each request stays bounded, and clearing the search stops automatic paging.
  useEffect(() => {
    if (search.trim() && status === "CanLoadMore") loadMore(20);
  }, [search, status, loadMore]);
  return result;
}
