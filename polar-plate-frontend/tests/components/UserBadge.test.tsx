import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserBadge from "@/components/UserBadge";
import { avatarColors } from "@/lib/avatar";

// The menu closes when the route changes, so the component reads the current path.
const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

const ID = "3f2b8c1e-0000-4000-8000-000000000001";

/** Mocks GET /api/users/me; pass a username to succeed or null to fail with a 401. */
function mockMe(username: string | null) {
  const fn = vi.fn(async () =>
    username === null
      ? { ok: false, status: 401, json: async () => ({ message: "Unauthorized" }) }
      : { ok: true, status: 200, json: async () => ({ user: { id: ID, username } }) },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  localStorage.setItem("authToken", "tok123");
  nav.pathname = "/dashboard";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

const renderBadge = (onLogout = () => {}) => render(<UserBadge onLogout={onLogout} />);
const trigger = () => screen.getByRole("button", { name: /account menu/i });

describe("UserBadge: the circle", () => {
  it("shows the first letter of the username, capitalized, in the circle", async () => {
    mockMe("zai");
    renderBadge();
    expect(await screen.findByText("Z")).toBeInTheDocument();
  });

  it("colors the circle from the user's id (same user, same color, always)", async () => {
    mockMe("zai");
    renderBadge();
    await screen.findByText("Z");
    const { bg, fg } = avatarColors(ID);
    expect(screen.getByTestId("user-badge-circle")).toHaveStyle({ backgroundColor: bg, color: fg });
  });

  it("asks the server who is logged in, sending the saved token", async () => {
    const fetchFn = mockMe("zai");
    renderBadge();
    await screen.findByText("Z");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/users\/me$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("puts the username in a hover tooltip on the circle once it has loaded", async () => {
    mockMe("zai");
    renderBadge();
    await screen.findByText("Z");
    expect(screen.getByTestId("user-badge-circle")).toHaveAttribute("title", "zai");
  });

  it("has no tooltip while there is no name (failed or no token)", () => {
    localStorage.clear();
    mockMe("zai");
    renderBadge();
    expect(screen.getByTestId("user-badge-circle")).not.toHaveAttribute("title");
  });

  it("shows an empty circle when the request fails, without crashing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = mockMe(null);
    renderBadge();
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByTestId("user-badge-circle")).toHaveTextContent("");
  });

  it("shows an empty circle when the network request throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    renderBadge();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByTestId("user-badge-circle")).toHaveTextContent("");
  });

  it("does not call the server when there is no saved token", () => {
    localStorage.clear();
    const fetchFn = mockMe("zai");
    renderBadge();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByTestId("user-badge-circle")).toHaveTextContent("");
  });
});

describe("UserBadge: the dropdown", () => {
  it("is a closed button at first: expanded=false, no menu content", async () => {
    mockMe("zai");
    renderBadge();
    await screen.findByText("Z");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("opens on click, with the full username, a Settings link and Log out", async () => {
    mockMe("zai");
    const user = userEvent.setup();
    renderBadge();
    await screen.findByText("Z");
    await user.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByTestId("user-menu");
    expect(within(menu).getByText("zai")).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/profile/settings");
    expect(within(menu).getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("the trigger is wired to the panel it opens (aria-controls)", async () => {
    mockMe("zai");
    const user = userEvent.setup();
    renderBadge();
    await screen.findByText("Z");
    await user.click(trigger());
    expect(trigger().getAttribute("aria-controls")).toBe(screen.getByTestId("user-menu").id);
  });

  it("toggles closed when the trigger is clicked again", async () => {
    mockMe("zai");
    const user = userEvent.setup();
    renderBadge();
    await screen.findByText("Z");
    await user.click(trigger());
    await user.click(trigger());
    expect(screen.queryByTestId("user-menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });

  it("Log out calls onLogout", async () => {
    mockMe("zai");
    const onLogout = vi.fn();
    const user = userEvent.setup();
    renderBadge(onLogout);
    await screen.findByText("Z");
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("Escape closes the menu and puts focus back on the trigger", async () => {
    mockMe("zai");
    const user = userEvent.setup();
    renderBadge();
    await screen.findByText("Z");
    await user.click(trigger());
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("user-menu")).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it("a click outside closes it, but a click inside the panel does not", async () => {
    mockMe("zai");
    const user = userEvent.setup();
    renderBadge();
    await screen.findByText("Z");
    await user.click(trigger());
    await user.click(within(screen.getByTestId("user-menu")).getByText("zai"));
    expect(screen.getByTestId("user-menu")).toBeInTheDocument();
    await user.click(document.body);
    expect(screen.queryByTestId("user-menu")).not.toBeInTheDocument();
  });

  it("closes when the route changes (e.g. after following the Settings link)", async () => {
    mockMe("zai");
    const user = userEvent.setup();
    const { rerender } = renderBadge();
    await screen.findByText("Z");
    await user.click(trigger());
    nav.pathname = "/profile/settings";
    rerender(<UserBadge onLogout={() => {}} />);
    await waitFor(() => expect(screen.queryByTestId("user-menu")).not.toBeInTheDocument());
  });

  it("Log out is still reachable when loading the user failed (nobody gets stranded)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = mockMe(null);
    const onLogout = vi.fn();
    const user = userEvent.setup();
    renderBadge(onLogout);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await user.click(trigger());
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalled();
  });

  it("has a phone-sized tap target (44px)", async () => {
    mockMe("zai");
    renderBadge();
    await screen.findByText("Z");
    expect(trigger()).toHaveClass("min-h-11", "min-w-11");
  });
});
