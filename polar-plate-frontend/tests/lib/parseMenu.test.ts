import { describe, expect, it } from "vitest";
import { parseMenu } from "@/lib/parseMenu";

const HALLS = ["Thorne", "Moulton"];
const soups = { category: "Soups", items: ["Tomato bisque", "Chili"] };

describe("parseMenu", () => {
  it("passes a well-formed response through unchanged", () => {
    const data = { Thorne: [soups], Moulton: [{ category: "Grill", items: ["Pancakes"] }] };
    expect(parseMenu(data, HALLS)).toEqual(data);
  });

  it("gives an empty list for a hall that is missing", () => {
    expect(parseMenu({ Thorne: [soups] }, HALLS)).toEqual({ Thorne: [soups], Moulton: [] });
  });

  it("gives an empty list for a hall whose value is not an array", () => {
    expect(parseMenu({ Thorne: "oops", Moulton: { category: "x" } }, HALLS)).toEqual({ Thorne: [], Moulton: [] });
  });

  it("drops a malformed category but keeps the good ones next to it", () => {
    const data = {
      Thorne: [soups, { category: "Broken" }, { category: 7, items: [] }, { category: "Bad items", items: ["ok", 3] }, null],
      Moulton: [],
    };
    expect(parseMenu(data, HALLS)).toEqual({ Thorne: [soups], Moulton: [] });
  });

  it.each([null, undefined, "text", 42, [], [soups]])("returns all-empty halls for a non-object response (%s)", (bad) => {
    expect(parseMenu(bad, HALLS)).toEqual({ Thorne: [], Moulton: [] });
  });

  it("ignores halls it was not asked about", () => {
    expect(parseMenu({ Thorne: [soups], Other: [soups] }, HALLS)).toEqual({ Thorne: [soups], Moulton: [] });
  });
});
