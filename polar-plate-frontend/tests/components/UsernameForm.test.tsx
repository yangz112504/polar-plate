import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UsernameForm from "@/components/profile/UsernameForm";

vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "react-toastify";

/** Mocks fetch with one response; returns the mock so tests can inspect the request. */
function mockFetch(status: number, body: object) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
const sentBody = (fn: ReturnType<typeof mockFetch>) => JSON.parse(fn.mock.calls[0][1]!.body as string);

beforeEach(() => localStorage.setItem("authToken", "tok123"));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  localStorage.clear();
});

const setup = (onChanged = vi.fn()) => {
  const user = userEvent.setup();
  render(<UsernameForm currentUsername="zai" onChanged={onChanged} />);
  const input = screen.getByLabelText("Username");
  const save = screen.getByRole("button", { name: "Save username" });
  /** Replaces the text in the box. */
  const typeName = async (name: string) => {
    await user.clear(input);
    await user.type(input, name);
  };
  const prompt = () => screen.getByRole("group", { name: /confirm username change/i });
  const confirm = () => screen.getByRole("button", { name: "Confirm" });
  const cancel = () => screen.getByRole("button", { name: "Cancel" });
  /** Types a name, presses Save and then Confirm. */
  const saveAndConfirm = async (name: string) => {
    await typeName(name);
    await user.click(save);
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
  };
  return { user, input, save, onChanged, typeName, prompt, confirm, cancel, saveAndConfirm };
};

describe("UsernameForm: editing", () => {
  it("starts with the current username in the box and Save disabled (nothing to save yet)", () => {
    const { input, save } = setup();
    expect(input).toHaveValue("zai");
    expect(save).toBeDisabled();
  });

  it("enables Save once the name is changed, and disables it again if changed back", async () => {
    const { user, input, save } = setup();
    await user.type(input, "x");
    expect(save).toBeEnabled();
    await user.clear(input);
    await user.type(input, "zai");
    expect(save).toBeDisabled();
  });

  it.each([
    ["ab", /at least 3/i],
    ["a".repeat(21), /at most 20/i],
    ["al ice", /letters, digits/i],
  ])("shows an inline error for %s, asks nothing and sends nothing", async (value, message) => {
    const fn = mockFetch(200, {});
    const { user, save, typeName } = setup();
    await typeName(value);
    await user.click(save);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /confirm username change/i })).not.toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("UsernameForm: the confirmation step", () => {
  it("Save asks 'Change your username to ...?' and sends nothing yet", async () => {
    const fn = mockFetch(200, {});
    const { user, save, typeName, prompt } = setup();
    await typeName("alicia");
    await user.click(save);
    expect(prompt()).toHaveTextContent(/change your username to/i);
    expect(prompt()).toHaveTextContent("alicia");
    expect(fn).not.toHaveBeenCalled();
  });

  it("swaps the Save button for Confirm and Cancel", async () => {
    mockFetch(200, {});
    const { user, save, typeName, confirm, cancel } = setup();
    await typeName("alicia");
    await user.click(save);
    expect(screen.queryByRole("button", { name: "Save username" })).not.toBeInTheDocument();
    expect(confirm()).toBeEnabled();
    expect(cancel()).toBeEnabled();
  });

  it("moves keyboard focus to the prompt (so screen readers announce it) without pre-selecting a button", async () => {
    mockFetch(200, {});
    const { user, save, typeName, prompt, confirm } = setup();
    await typeName("alicia");
    await user.click(save);
    expect(prompt()).toHaveFocus();
    expect(confirm()).not.toHaveFocus();
  });

  it("makes the box read-only while asking, so the name shown is the name sent", async () => {
    mockFetch(200, {});
    const { user, save, input, typeName } = setup();
    await typeName("alicia");
    await user.click(save);
    expect(input).toHaveAttribute("readonly");
  });

  it("Cancel closes the prompt, sends nothing, keeps the typed name and returns focus to the box", async () => {
    const fn = mockFetch(200, {});
    const { user, save, input, typeName, cancel } = setup();
    await typeName("alicia");
    await user.click(save);
    await user.click(cancel());
    expect(screen.queryByRole("group", { name: /confirm username change/i })).not.toBeInTheDocument();
    expect(fn).not.toHaveBeenCalled();
    expect(input).toHaveValue("alicia");
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toHaveFocus();
    expect(screen.getByRole("button", { name: "Save username" })).toBeEnabled();
  });
});

describe("UsernameForm: after Confirm", () => {
  it("PATCHes /api/users/me with the token and the new name, then reports it", async () => {
    const fn = mockFetch(200, { user: { id: "i", username: "alicia" } });
    const { saveAndConfirm, onChanged } = setup();
    await saveAndConfirm("alicia");
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("alicia"));
    const [url, init] = fn.mock.calls[0];
    expect(url).toMatch(/\/api\/users\/me$/);
    expect(init!.method).toBe("PATCH");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
    expect(sentBody(fn)).toEqual({ username: "alicia" });
    expect(toast.success).toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /confirm username change/i })).not.toBeInTheDocument();
  });

  it("shows the server's 'Username already taken', closes the prompt and lets the user edit again", async () => {
    mockFetch(409, { message: "Username already taken" });
    const { saveAndConfirm, onChanged, input } = setup();
    await saveAndConfirm("bob");
    expect(await screen.findByRole("alert")).toHaveTextContent("Username already taken");
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: /confirm username change/i })).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("readonly");
    expect(input).toHaveValue("bob");
  });

  it("shows a generic message when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const { saveAndConfirm, onChanged } = setup();
    await saveAndConfirm("alicia");
    expect(await screen.findByRole("alert")).toHaveTextContent(/something went wrong/i);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("disables Confirm and Cancel while the request is in flight, so it cannot be sent twice", async () => {
    let finish!: (v: unknown) => void;
    const fn = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    vi.stubGlobal("fetch", fn);
    const { saveAndConfirm, confirm, cancel } = setup();
    await saveAndConfirm("alicia");
    expect(confirm()).toBeDisabled();
    expect(cancel()).toBeDisabled();
    finish({ ok: true, status: 200, json: async () => ({ user: { id: "i", username: "alicia" } }) });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
