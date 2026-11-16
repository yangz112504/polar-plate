import { describe, expect, it, vi } from "vitest";
import thorneLunch from "../fixtures/thorne-lunch-2026-11-12.json";
import { MenuFetchError, MenuFormatError } from "../../src/menus/errors";
import { fetchMenu } from "../../src/menus/menuClient";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const status = (code: number) => new Response("{}", { status: code });
const noSleep = (_ms: number) => Promise.resolve();

/** Builds options with a scripted fake fetch that returns/throws the given outcomes in order. */
function scripted(...outcomes: (Response | Error)[]) {
  const fetchImpl = vi.fn(async () => {
    const next = outcomes.shift();
    if (!next) throw new Error("fetch called more times than scripted");
    if (next instanceof Error) throw next;
    return next;
  });
  const sleep = vi.fn(noSleep);
  return { fetchImpl: fetchImpl as unknown as typeof fetch, sleep, backoffMs: [500, 1000], mocks: { fetchImpl, sleep } };
}

describe("fetchMenu", () => {
  it("requests the lowercase hall/meal URL with an identifying User-Agent", async () => {
    const o = scripted(ok(thorneLunch));
    await fetchMenu("2026-11-12", "Thorne", "Lunch", o);
    const [url, init] = o.mocks.fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://dining-menu.bowdoin.edu/menu/2026-11-12/thorne/lunch");
    expect(new Headers(init.headers).get("user-agent")).toMatch(/polar-plate/i);
  });

  it("returns the parsed categories on success", async () => {
    const result = await fetchMenu("2026-11-12", "Thorne", "Lunch", scripted(ok(thorneLunch)));
    expect(result[0]).toEqual({ category: "Soup", items: expect.any(Array) });
  });

  it("returns [] when Bowdoin answers 404 (no menu published) without retrying", async () => {
    const o = scripted(status(404));
    expect(await fetchMenu("2026-11-12", "Thorne", "Brunch", o)).toEqual([]);
    expect(o.mocks.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns [] when Bowdoin answers 200 with an empty list", async () => {
    expect(await fetchMenu("2026-11-12", "Thorne", "Lunch", scripted(ok([])))).toEqual([]);
  });

  it("retries a 500 and succeeds on the second attempt, pausing with backoff", async () => {
    const o = scripted(status(500), ok(thorneLunch));
    const result = await fetchMenu("2026-11-12", "Thorne", "Lunch", o);
    expect(result.length).toBeGreaterThan(0);
    expect(o.mocks.fetchImpl).toHaveBeenCalledTimes(2);
    expect(o.mocks.sleep).toHaveBeenCalledWith(500);
  });

  it("retries network errors and gives up after 3 attempts with MenuFetchError", async () => {
    const o = scripted(new Error("ECONNRESET"), new Error("ECONNRESET"), new Error("ECONNRESET"));
    await expect(fetchMenu("2026-11-12", "Thorne", "Lunch", o)).rejects.toBeInstanceOf(MenuFetchError);
    expect(o.mocks.fetchImpl).toHaveBeenCalledTimes(3);
    expect(o.mocks.sleep.mock.calls.map((c) => c[0])).toEqual([500, 1000]);
  });

  it("does not retry other 4xx errors (e.g. 403) and throws MenuFetchError", async () => {
    const o = scripted(status(403));
    await expect(fetchMenu("2026-11-12", "Thorne", "Lunch", o)).rejects.toBeInstanceOf(MenuFetchError);
    expect(o.mocks.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws MenuFormatError, without retrying, when the JSON has the wrong shape", async () => {
    const o = scripted(ok({ unexpected: true }));
    await expect(fetchMenu("2026-11-12", "Thorne", "Lunch", o)).rejects.toBeInstanceOf(MenuFormatError);
    expect(o.mocks.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("throws MenuFormatError when the body isn't JSON", async () => {
    const o = scripted(new Response("<html>oops</html>", { status: 200 }));
    await expect(fetchMenu("2026-11-12", "Thorne", "Lunch", o)).rejects.toBeInstanceOf(MenuFormatError);
  });

  it("times out a request that never answers and reports MenuFetchError", async () => {
    // Fake fetch that only finishes when it is aborted, like the real one.
    const hanging = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(
      fetchMenu("2026-11-12", "Thorne", "Lunch", { fetchImpl: hanging, sleep: noSleep, backoffMs: [], timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(MenuFetchError);
  });
});
