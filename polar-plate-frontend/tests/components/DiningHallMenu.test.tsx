import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DiningHallMenu from "@/components/DiningHallMenu";

// Toasts are not under test here.
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const weekday = { date: "2026-11-16", meals: ["Breakfast", "Lunch", "Dinner"], defaultMeal: "Breakfast" };
const weekend = { date: "2026-11-21", meals: ["Brunch", "Dinner"], defaultMeal: "Brunch" };

/** What GET /api/menus/:meal returns, keyed by meal. */
const menus: Record<string, unknown> = {
  Breakfast: {
    Thorne: [
      { category: "Hot Entrées", items: ["Scrambled eggs", "Turkey sausage"] },
      { category: "Bakery", items: ["Blueberry muffins"] },
    ],
    Moulton: [{ category: "Grill", items: ["Pancakes"] }],
  },
  Lunch: { Thorne: [{ category: "Soups", items: ["Tomato bisque"] }], Moulton: [] },
  Brunch: { Thorne: [{ category: "Brunch Bar", items: ["Waffles"] }], Moulton: [] },
};

/** Mocks every endpoint the dashboard menu calls; returns the fetch mock so tests can inspect URLs. */
function mockApi(schedule = weekday) {
  const fn = vi.fn(async (url: string) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("/api/menus/schedule")) return ok(schedule);
    const menu = url.match(/\/api\/menus\/(\w+)$/);
    if (menu) return ok(menus[menu[1]] ?? { Thorne: [], Moulton: [] });
    if (url.includes("/api/ratings/user")) return ok({ userRating: null });
    if (url.endsWith("/all")) return ok({ ratings: [] });
    return ok({ avgRating: "4.2", totalRatings: 37 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => localStorage.setItem("authToken", "t"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  localStorage.clear();
});

/** The scrollable part of the page: only the menu sections live in it. */
const menuRegion = () => screen.getByRole("region", { name: "Menu sections" });

describe("header", () => {
  it("shows the hall name before the meal name, plus the date", async () => {
    mockApi();
    render(<DiningHallMenu />);
    expect(await screen.findByRole("heading", { level: 1, name: "Thorne Breakfast" })).toBeInTheDocument();
    expect(screen.getByText("Monday, November 16")).toBeInTheDocument();
  });

  it("follows the hall tab", async () => {
    mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1, name: "Thorne Breakfast" });
    await userEvent.click(screen.getByRole("tab", { name: "Moulton" }));
    expect(screen.getByRole("heading", { level: 1, name: "Moulton Breakfast" })).toBeInTheDocument();
  });

  it("follows the meal tab and loads that meal's menu", async () => {
    const fetchMock = mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1, name: "Thorne Breakfast" });
    await userEvent.click(screen.getByRole("tab", { name: "Lunch" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Thorne Lunch" })).toBeInTheDocument();
    expect(await within(menuRegion()).findByRole("heading", { name: "Soups" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/api/menus/Lunch"))).toBe(true);
  });
});

describe("tabs", () => {
  it("has a hall tab row and a meal tab row, with the hall selected first", async () => {
    mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1 });
    const halls = screen.getByRole("tablist", { name: "Dining hall" });
    expect(within(halls).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Thorne", "Moulton"]);
    expect(within(halls).getByRole("tab", { name: "Thorne" })).toHaveAttribute("aria-selected", "true");
    const meals = screen.getByRole("tablist", { name: "Meal" });
    expect(within(meals).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    expect(within(meals).getByRole("tab", { name: "Breakfast" })).toHaveAttribute("aria-selected", "true");
  });

  it("shows Brunch and Dinner on a weekend, opening on Brunch", async () => {
    mockApi(weekend);
    render(<DiningHallMenu />);
    expect(await screen.findByRole("heading", { level: 1, name: "Thorne Brunch" })).toBeInTheDocument();
    const meals = screen.getByRole("tablist", { name: "Meal" });
    expect(within(meals).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Brunch", "Dinner"]);
  });
});

describe("layout: what scrolls and what stays put", () => {
  it("keeps the menu sections inside the scrolling region", async () => {
    mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1 });
    const region = menuRegion();
    expect(await within(region).findByRole("heading", { name: "Hot Entrées" })).toBeInTheDocument();
    expect(within(region).getByRole("heading", { name: "Bakery" })).toBeInTheDocument();
    expect(within(region).getByText("Scrambled eggs")).toBeInTheDocument();
  });

  it("keeps the title, the tabs and 'Your rating' outside the scrolling region", async () => {
    mockApi();
    render(<DiningHallMenu />);
    const title = await screen.findByRole("heading", { level: 1 });
    const region = menuRegion();
    expect(region).not.toContainElement(title);
    expect(region).not.toContainElement(screen.getByRole("tablist", { name: "Dining hall" }));
    expect(region).not.toContainElement(screen.getByRole("tablist", { name: "Meal" }));
    expect(region).not.toContainElement(screen.getByText("Your rating"));
    expect(region).not.toContainElement(screen.getByRole("button", { name: "Rate 3 stars" }));
  });

  it("says 'No menu found' inside the region when the hall has no menu", async () => {
    mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("tab", { name: "Lunch" }));
    await userEvent.click(screen.getByRole("tab", { name: "Moulton" }));
    expect(await within(menuRegion()).findByText("No menu found")).toBeInTheDocument();
  });
});

describe("section outlines while scrolling", () => {
  it("are off at rest", async () => {
    mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1 });
    expect(menuRegion()).toHaveAttribute("data-scrolling", "false");
  });

  it("turn on when the menu scrolls and off again shortly after it stops", async () => {
    mockApi();
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1 });
    await within(menuRegion()).findByRole("heading", { name: "Bakery" });
    vi.useFakeTimers(); // only from here, so the data loading above used real timers

    fireEvent.scroll(menuRegion());
    expect(menuRegion()).toHaveAttribute("data-scrolling", "true");

    act(() => vi.advanceTimersByTime(500)); // still inside the quiet period
    expect(menuRegion()).toHaveAttribute("data-scrolling", "true");

    fireEvent.scroll(menuRegion()); // scrolling again restarts the countdown
    act(() => vi.advanceTimersByTime(800));
    expect(menuRegion()).toHaveAttribute("data-scrolling", "true");

    act(() => vi.advanceTimersByTime(200)); // 1000 ms after the last scroll
    expect(menuRegion()).toHaveAttribute("data-scrolling", "false");
  });
});

describe("when something fails or the names are unusual", () => {
  it("says the ratings could not be loaded instead of 'No ratings yet'", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const base = mockApi();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        /\/api\/ratings\/Thorne\/Breakfast$/.test(url)
          ? { ok: false, status: 500, json: async () => ({ message: "boom" }) }
          : base(url),
      ),
    );
    render(<DiningHallMenu />);
    expect(await screen.findByText("Couldn't load ratings")).toBeInTheDocument();
    expect(screen.queryByText("No ratings yet")).not.toBeInTheDocument();
  });

  it("encodes the meal name in every request URL", async () => {
    const fetchMock = mockApi({ date: "2026-11-16", meals: ["Late Night"], defaultMeal: "Late Night" });
    render(<DiningHallMenu />);
    await screen.findByRole("heading", { level: 1, name: "Thorne Late Night" });
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls.some((u) => u.endsWith("/api/menus/Late%20Night"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/api/ratings/Thorne/Late%20Night"))).toBe(true);
      expect(urls.some((u) => u.endsWith("/api/ratings/Thorne/Late%20Night/all"))).toBe(true);
      expect(urls.some((u) => u.includes("/api/ratings/user?hall=Thorne&meal=Late%20Night"))).toBe(true);
    });
  });
});
