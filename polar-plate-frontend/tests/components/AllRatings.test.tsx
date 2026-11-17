import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AllRatings from "@/components/AllRatings";

/** Mocks the all-ratings endpoint: Thorne answers with two ratings, anything else fails with a 500. */
function mockApi() {
  const fn = vi.fn(async (url: string) =>
    url.includes("/Thorne/")
      ? {
          ok: true,
          status: 200,
          json: async () => ({
            ratings: [
              { _id: "1", rating: 3, user: { username: "ann" } },
              { _id: "2", rating: 4.5, user: { username: "bo" } },
            ],
          }),
        }
      : { ok: false, status: 500, json: async () => ({ message: "boom" }) },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => localStorage.setItem("authToken", "t"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("AllRatings", () => {
  it("lists each user's score, highest first", async () => {
    mockApi();
    render(<AllRatings hall="Thorne" meal="Lunch" refreshKey={0} />);
    const names = (await screen.findAllByRole("listitem")).map((li) => li.textContent);
    expect(names[0]).toContain("bo");
    expect(names[0]).toContain("4.5 / 5");
    expect(names[1]).toContain("ann");
  });

  it("does not keep showing the previous hall's ratings when the next request fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockApi();
    const { rerender } = render(<AllRatings hall="Thorne" meal="Lunch" refreshKey={0} />);
    await screen.findByText("bo");
    rerender(<AllRatings hall="Moulton" meal="Lunch" refreshKey={0} />);
    expect(await screen.findByText("No ratings yet.")).toBeInTheDocument();
    expect(screen.queryByText("bo")).not.toBeInTheDocument();
  });

  it("puts the meal name in the URL encoded", async () => {
    const fetchFn = mockApi();
    render(<AllRatings hall="Thorne" meal="Late Night" refreshKey={0} />);
    await screen.findAllByRole("listitem");
    expect(String(fetchFn.mock.calls[0][0])).toMatch(/\/api\/ratings\/Thorne\/Late%20Night\/all$/);
  });
});
