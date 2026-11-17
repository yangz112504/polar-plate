import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UserBadge from "@/components/UserBadge";

/** Mocks GET /api/users/me; pass a username to succeed or null to fail with a 401. */
function mockMe(username: string | null) {
  const fn = vi.fn(async () =>
    username === null
      ? { ok: false, status: 401, json: async () => ({ message: "Unauthorized" }) }
      : { ok: true, status: 200, json: async () => ({ user: { username } }) },
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => localStorage.setItem("authToken", "tok123"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("UserBadge", () => {
  it("shows the first letter of the username, capitalized, in the circle", async () => {
    mockMe("zai");
    render(<UserBadge />);
    expect(await screen.findByText("Z")).toBeInTheDocument();
  });

  it("also has the full username as text (visible from desktop width, read aloud on phones)", async () => {
    mockMe("zai");
    render(<UserBadge />);
    expect(await screen.findByText("zai")).toBeInTheDocument();
  });

  it("asks the server who is logged in, sending the saved token", async () => {
    const fetchFn = mockMe("zai");
    render(<UserBadge />);
    await screen.findByText("zai");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/users\/me$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
  });

  it("shows an empty circle and no name when the request fails, without crashing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchFn = mockMe(null);
    render(<UserBadge />);
    await waitFor(() => expect(fetchFn).toHaveBeenCalled());
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.queryByText("zai")).not.toBeInTheDocument();
    expect(screen.getByTestId("user-badge-circle")).toHaveTextContent("");
  });

  it("shows an empty circle when the network request throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<UserBadge />);
    await waitFor(() => expect(console.error).toHaveBeenCalled());
    expect(screen.getByTestId("user-badge-circle")).toHaveTextContent("");
  });

  it("does not call the server when there is no saved token", () => {
    localStorage.clear();
    const fetchFn = mockMe("zai");
    render(<UserBadge />);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.getByTestId("user-badge-circle")).toHaveTextContent("");
  });
});
