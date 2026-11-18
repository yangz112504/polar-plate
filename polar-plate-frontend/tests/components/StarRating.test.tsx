import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StarRating from "@/components/StarRating";

// Toasts are visual noise here; we only check that the right one is requested.
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "react-toastify";

/** Mocks fetch: GET /api/ratings/user returns `saved`; POST returns a success body. */
function mockFetch(saved: number | null) {
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, json: async () => ({ message: "Rating saved", updated: false }) };
    }
    return { ok: true, json: async () => ({ userRating: saved }) };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
/** The JSON body of the POST that was sent, or undefined. */
const postedBody = (fn: ReturnType<typeof mockFetch>) => {
  const call = fn.mock.calls.find(([, init]) => init?.method === "POST");
  return call ? JSON.parse(call[1]!.body as string) : undefined;
};
const star = (n: number) => screen.getByRole("button", { name: `Rate ${n} stars` });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["Date"] });
  localStorage.setItem("authToken", "t");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const setup = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
const DAY = "2026-11-17";
const ui = (day: string) => <StarRating activeTab="Thorne" meal="Lunch" day={day} onSubmitSuccess={() => {}} />;
const renderIt = () => render(ui(DAY));

describe("StarRating", () => {
  it("shows the hint about single and double clicks", () => {
    mockFetch(null);
    renderIt();
    expect(screen.getByText("Click once for a full star, double-click for a half star.")).toBeInTheDocument();
  });

  it("starts at 0 / 5 and refuses to submit", async () => {
    const fn = mockFetch(null);
    const user = setup();
    renderIt();
    expect(screen.getByText("0 / 5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit Rating" }));
    expect(postedBody(fn)).toBeUndefined();
    expect(toast.error).toHaveBeenCalled();
  });

  it("one click then Submit posts a whole score", async () => {
    const fn = mockFetch(null);
    const user = setup();
    renderIt();
    await user.click(star(3));
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit Rating" }));
    await waitFor(() => expect(postedBody(fn)).toEqual({ hall: "Thorne", meal: "Lunch", rating: 3 }));
  });

  it("two quick clicks on star 3 then Submit posts 2.5", async () => {
    const fn = mockFetch(null);
    const user = setup();
    renderIt();
    await user.click(star(3));
    await user.click(star(3));
    expect(screen.getByText("2.5 / 5")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Submit Rating" }));
    await waitFor(() => expect(postedBody(fn)?.rating).toBe(2.5));
  });

  it("two clicks more than the window apart stay a full star", async () => {
    mockFetch(null);
    const user = setup();
    renderIt();
    await user.click(star(3));
    await act(async () => { vi.advanceTimersByTime(1500); });
    await user.click(star(3));
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  it("works from the keyboard: Enter twice quickly on star 2 gives 1.5", async () => {
    mockFetch(null);
    const user = setup();
    renderIt();
    star(2).focus();
    await user.keyboard("{Enter}{Enter}");
    expect(screen.getByText("1.5 / 5")).toBeInTheDocument();
  });

  it("shows a saved half-star rating (2.5) from the server", async () => {
    mockFetch(2.5);
    renderIt();
    expect(await screen.findByText("2.5 / 5")).toBeInTheDocument();
    // 2 full stars, 1 half star, 2 empty stars.
    expect(screen.getAllByTestId("star-full")).toHaveLength(2);
    expect(screen.getAllByTestId("star-half")).toHaveLength(1);
    expect(screen.getAllByTestId("star-empty")).toHaveLength(2);
  });

  // Review item #1: the server day rolls over while the page stays open, same hall and meal name.
  it("reloads the saved score when only the day changes (no stale score from yesterday)", async () => {
    mockFetch(4);
    const { rerender } = renderIt();
    expect(await screen.findByText("4 / 5")).toBeInTheDocument();

    const fn = mockFetch(null); // today's meal has no rating yet
    rerender(ui("2026-11-18"));
    expect(await screen.findByText("0 / 5")).toBeInTheDocument();
    expect(fn.mock.calls.some(([url]) => String(url).includes("/api/ratings/user"))).toBe(true);
  });

  it("one click on the saved star keeps it whole (saved 4, click 4 -> 4)", async () => {
    mockFetch(4);
    const user = setup();
    renderIt();
    await screen.findByText("4 / 5");
    await user.click(star(4));
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
  });
});
