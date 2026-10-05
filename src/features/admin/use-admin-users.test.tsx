import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAdminUsers } from "./use-admin-users";
const paging = vi.hoisted(() => ({ status: "CanLoadMore", loadMore: vi.fn() }));
vi.mock("convex/react", () => ({ usePaginatedQuery: () => paging }));
it("searches beyond the first page in bounded requests and stops when cleared or exhausted", () => {
  const view = renderHook(({ search }) => useAdminUsers(search), {
    initialProps: { search: "" },
  });
  expect(paging.loadMore).not.toHaveBeenCalled();
  view.rerender({ search: "older@example.com" });
  expect(paging.loadMore).toHaveBeenCalledWith(20);
  paging.status = "LoadingMore";
  view.rerender({ search: "older@example.com" });
  expect(paging.loadMore).toHaveBeenCalledTimes(1);
  paging.status = "CanLoadMore";
  view.rerender({ search: "older@example.com" });
  expect(paging.loadMore).toHaveBeenCalledTimes(2);
  view.rerender({ search: "" });
  expect(paging.loadMore).toHaveBeenCalledTimes(2);
  paging.status = "Exhausted";
  view.rerender({ search: "older@example.com" });
  expect(paging.loadMore).toHaveBeenCalledTimes(2);
});
