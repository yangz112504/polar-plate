import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSchedule, type Schedule } from "@/lib/useSchedule";

const day1: Schedule = { date: "2026-11-16", meals: ["Breakfast", "Lunch", "Dinner"], defaultMeal: "Lunch" };
const day2: Schedule = { date: "2026-11-17", meals: ["Breakfast", "Lunch", "Dinner"], defaultMeal: "Breakfast" };

/** Mocks fetch to answer with the given responses in order (the last one repeats). */
function mockSchedule(...responses: Array<Schedule | "fail">) {
  let i = 0;
  const fn = vi.fn(async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return r === "fail"
      ? { ok: false, status: 500, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => r };
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
/** Simulates the user coming back to the tab / window. */
const comeBack = () =>
  act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus"));
  });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSchedule", () => {
  it("loads the schedule on mount", async () => {
    mockSchedule(day1);
    const { result } = renderHook(() => useSchedule("http://api", () => {}));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    expect(result.current.failed).toBe(false);
  });

  it("reports failed when the first load fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSchedule("fail");
    const { result } = renderHook(() => useSchedule("http://api", () => {}));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.schedule).toBeNull();
  });

  it("does not call onNewDay for the first load", async () => {
    mockSchedule(day1);
    const onNewDay = vi.fn();
    const { result } = renderHook(() => useSchedule("http://api", onNewDay));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    expect(onNewDay).not.toHaveBeenCalled();
  });

  it("refetches when the user returns, and stays quiet if it is still the same day", async () => {
    const fetchFn = mockSchedule(day1, day1);
    const onNewDay = vi.fn();
    const { result } = renderHook(() => useSchedule("http://api", onNewDay));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    const before = fetchFn.mock.calls.length;
    await comeBack();
    await waitFor(() => expect(fetchFn.mock.calls.length).toBeGreaterThan(before));
    expect(onNewDay).not.toHaveBeenCalled();
  });

  it("makes ONE request when the tab regains visibility and focus together (both events fire)", async () => {
    const fetchFn = mockSchedule(day1, day1, day1);
    const { result } = renderHook(() => useSchedule("http://api", () => {}));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    const before = fetchFn.mock.calls.length;
    await comeBack();
    await waitFor(() => expect(fetchFn.mock.calls.length).toBe(before + 1));
    await act(async () => { await Promise.resolve(); });
    expect(fetchFn.mock.calls.length).toBe(before + 1);
  });

  it("calls onNewDay once when the server's date has changed since the page loaded", async () => {
    mockSchedule(day1, day2);
    const onNewDay = vi.fn();
    const { result } = renderHook(() => useSchedule("http://api", onNewDay));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    await comeBack();
    await waitFor(() => expect(onNewDay).toHaveBeenCalledTimes(1));
  });

  it("ignores a failed refetch: keeps the loaded schedule and does not call onNewDay", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSchedule(day1, "fail");
    const onNewDay = vi.fn();
    const { result } = renderHook(() => useSchedule("http://api", onNewDay));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    await comeBack();
    await act(async () => { await Promise.resolve(); });
    expect(result.current.schedule).toEqual(day1);
    expect(result.current.failed).toBe(false);
    expect(onNewDay).not.toHaveBeenCalled();
  });

  it("stops listening after unmount", async () => {
    const fetchFn = mockSchedule(day1);
    const { result, unmount } = renderHook(() => useSchedule("http://api", () => {}));
    await waitFor(() => expect(result.current.schedule).toEqual(day1));
    unmount();
    const before = fetchFn.mock.calls.length;
    await comeBack();
    expect(fetchFn.mock.calls.length).toBe(before);
  });
});
