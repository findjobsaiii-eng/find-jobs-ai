import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAdminUsers } from "./use-admin-users";
const paging = vi.hoisted(() => ({
  status: "CanLoadMore",
  loadMore: vi.fn(),
  query: vi.fn(),
}));
vi.mock("convex/react", () => ({
  usePaginatedQuery: (...args: unknown[]) => {
    paging.query(...args);
    return paging;
  },
}));
it("sends search to the server and does not download every account", () => {
  const view = renderHook(({ search }) => useAdminUsers(search), {
    initialProps: { search: "" },
  });
  view.rerender({ search: "older@example.com" });
  expect(paging.query).toHaveBeenLastCalledWith(
    expect.anything(),
    { search: "older@example.com" },
    { initialNumItems: 20 },
  );
  expect(paging.loadMore).not.toHaveBeenCalled();
  view.rerender({ search: "" });
  expect(paging.query).toHaveBeenLastCalledWith(
    expect.anything(),
    {},
    { initialNumItems: 20 },
  );
});
