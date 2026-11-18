import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PasswordForm from "@/components/profile/PasswordForm";

vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "react-toastify";

/** Mocks fetch with one response; returns the mock so tests can inspect the request. */
function mockFetch(status: number, body: object) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => localStorage.setItem("authToken", "old-token"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const setup = () => {
  const user = userEvent.setup();
  render(<PasswordForm />);
  const current = screen.getByLabelText("Current password");
  const next = screen.getByLabelText("New password");
  const confirmField = screen.getByLabelText("Confirm new password");
  const submit = screen.getByRole("button", { name: "Change password" });
  const prompt = () => screen.getByRole("group", { name: /confirm password change/i });
  const confirm = () => screen.getByRole("button", { name: "Confirm" });
  const cancel = () => screen.getByRole("button", { name: "Cancel" });
  /** Types into all three boxes (empty strings are skipped) and presses the button. */
  const fillAndSubmit = async (c: string, n: string, k: string) => {
    if (c) await user.type(current, c);
    if (n) await user.type(next, n);
    if (k) await user.type(confirmField, k);
    await user.click(submit);
  };
  /** Fills the form with valid values, presses the button, then Confirm. */
  const fillSubmitAndConfirm = async (c = "old-password", n = "a-new-password") => {
    await fillAndSubmit(c, n, n);
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
  };
  return { user, current, next, confirmField, submit, prompt, confirm, cancel, fillAndSubmit, fillSubmitAndConfirm };
};

describe("PasswordForm: editing", () => {
  it("uses password inputs (characters are hidden)", () => {
    const { current, next, confirmField } = setup();
    for (const el of [current, next, confirmField]) expect(el).toHaveAttribute("type", "password");
  });

  it("asks for the current password when it is empty, with no prompt and nothing sent", async () => {
    const fn = mockFetch(200, {});
    const { fillAndSubmit } = setup();
    await fillAndSubmit("", "a-new-password", "a-new-password");
    expect(await screen.findByText(/enter your current password/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /confirm password change/i })).not.toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const fn = mockFetch(200, {});
    const { fillAndSubmit } = setup();
    await fillAndSubmit("old-password", "short7!", "short7!");
    expect(await screen.findByText(/at least 8/i)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /confirm password change/i })).not.toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });

  it("rejects a confirmation that does not match", async () => {
    const fn = mockFetch(200, {});
    const { fillAndSubmit } = setup();
    await fillAndSubmit("old-password", "a-new-password", "a-different-one");
    expect(await screen.findByText("Passwords do not match.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /confirm password change/i })).not.toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("PasswordForm: the confirmation step", () => {
  it("asks 'Change your password?', warns about other devices, and sends nothing yet", async () => {
    const fn = mockFetch(200, {});
    const { fillAndSubmit, prompt } = setup();
    await fillAndSubmit("old-password", "a-new-password", "a-new-password");
    expect(prompt()).toHaveTextContent(/change your password\?/i);
    expect(prompt()).toHaveTextContent(/logged out on your other devices/i);
    expect(fn).not.toHaveBeenCalled();
    expect(localStorage.getItem("authToken")).toBe("old-token");
  });

  it("swaps the Change password button for Confirm and Cancel", async () => {
    mockFetch(200, {});
    const { fillAndSubmit, confirm, cancel } = setup();
    await fillAndSubmit("old-password", "a-new-password", "a-new-password");
    expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    expect(cancel()).toBeEnabled();
  });

  it("moves keyboard focus to the prompt without pre-selecting a button", async () => {
    mockFetch(200, {});
    const { fillAndSubmit, prompt, confirm } = setup();
    await fillAndSubmit("old-password", "a-new-password", "a-new-password");
    expect(prompt()).toHaveFocus();
    expect(confirm()).not.toHaveFocus();
  });

  it("makes the boxes read-only while asking", async () => {
    mockFetch(200, {});
    const { fillAndSubmit, current, next, confirmField } = setup();
    await fillAndSubmit("old-password", "a-new-password", "a-new-password");
    for (const el of [current, next, confirmField]) expect(el).toHaveAttribute("readonly");
  });

  it("Cancel closes the prompt, sends nothing, keeps what was typed and returns focus to the first box", async () => {
    const fn = mockFetch(200, {});
    const { user, fillAndSubmit, cancel, current, next } = setup();
    await fillAndSubmit("old-password", "a-new-password", "a-new-password");
    await user.click(cancel());
    expect(screen.queryByRole("group", { name: /confirm password change/i })).not.toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
    expect(current).toHaveValue("old-password");
    expect(next).toHaveValue("a-new-password");
    expect(current).not.toHaveAttribute("readonly");
    expect(current).toHaveFocus();
    expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  });
});

describe("PasswordForm: after Confirm", () => {
  it("PUTs the current and new password (not the confirmation) with the old token", async () => {
    const fn = mockFetch(200, { message: "Password changed", token: "fresh-token" });
    const { fillSubmitAndConfirm } = setup();
    await fillSubmitAndConfirm();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    const [url, init] = fn.mock.calls[0];
    expect(url).toMatch(/\/api\/users\/me\/password$/);
    expect(init!.method).toBe("PUT");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer old-token");
    expect(JSON.parse(init!.body as string)).toEqual({ currentPassword: "old-password", newPassword: "a-new-password" });
  });

  it("swaps in the fresh token (the old one was just revoked), clears the boxes and closes the prompt", async () => {
    mockFetch(200, { message: "Password changed", token: "fresh-token" });
    const { fillSubmitAndConfirm, current, next, confirmField } = setup();
    await fillSubmitAndConfirm();
    await waitFor(() => expect(localStorage.getItem("authToken")).toBe("fresh-token"));
    for (const el of [current, next, confirmField]) expect(el).toHaveValue("");
    expect(screen.queryByRole("group", { name: /confirm password change/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  });

  it("shows 'Current password is incorrect', keeps the old token, closes the prompt and keeps what was typed", async () => {
    mockFetch(400, { message: "Current password is incorrect" });
    const { fillSubmitAndConfirm, current, next } = setup();
    await fillSubmitAndConfirm("wrong-password");
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect");
    expect(localStorage.getItem("authToken")).toBe("old-token");
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /confirm password change/i })).not.toBeInTheDocument();
    expect(current).toHaveValue("wrong-password");
    expect(current).not.toHaveAttribute("readonly");
    expect(next).toHaveValue("a-new-password");
  });

  it("shows the server's message when rate limited (429)", async () => {
    mockFetch(429, { message: "Too many attempts. Try again later." });
    const { fillSubmitAndConfirm } = setup();
    await fillSubmitAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Try again later.");
  });

  it("shows a generic message when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { fillSubmitAndConfirm } = setup();
    await fillSubmitAndConfirm();
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(localStorage.getItem("authToken")).toBe("old-token");
  });

  it("disables Confirm and Cancel while the request is in flight", async () => {
    let finish!: (v: unknown) => void;
    const fn = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fn);
    const { fillSubmitAndConfirm, confirm, cancel } = setup();
    await fillSubmitAndConfirm();
    expect(confirm()).toBeDisabled();
    expect(cancel()).toBeDisabled();
    finish({ ok: true, status: 200, json: async () => ({ message: "Password changed", token: "t2" }) });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
