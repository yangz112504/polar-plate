import { describe, expect, it } from "vitest";
import thorneLunch from "../fixtures/thorne-lunch-2026-11-12.json";
import moultonLunch from "../fixtures/moulton-lunch-2026-11-12.json";
import { MenuFormatError } from "../../src/menus/errors";
import { parseMenuResponse } from "../../src/menus/parser";

const course = (name: string, sort: number, items: { item: string; sort_order: number }[]) => ({
  course: name,
  course_sort: sort,
  items,
});

describe("parseMenuResponse with real Bowdoin responses (2026-11-12 lunch)", () => {
  it("keeps only the courses Bowdoin's page shows, in order (Thorne)", () => {
    const result = parseMenuResponse(thorneLunch);
    expect(result.map((c) => c.category)).toEqual([
      "Soup", "Salads", "Main Course", "Starches", "Vegetables", "Desserts", "Deli",
    ]);
    // Hidden on Bowdoin's page: Salad Bar, Deli Bar, Fresh Fruit
  });

  it("keeps Grab and Go and omits courses that aren't served (Moulton)", () => {
    const names = parseMenuResponse(moultonLunch).map((c) => c.category);
    expect(names).toContain("Grab and Go");
    expect(names).not.toContain("Display"); // not served that day, so no header
  });

  it("returns dish names as plain strings in sort order", () => {
    const soup = parseMenuResponse(thorneLunch).find((c) => c.category === "Soup");
    expect(soup?.items).toEqual(["Kozhi Razam - Indian Chicken Soup", "Curried Carrot Coconut Soup (VE)"]);
  });

  it("returns the right number of dishes per course (Thorne Main Course has 6)", () => {
    expect(parseMenuResponse(thorneLunch).find((c) => c.category === "Main Course")?.items).toHaveLength(6);
  });
});

describe("parseMenuResponse edge cases", () => {
  it("drops a course named 'null' and any course not on the show list", () => {
    const json = [
      course("null", 1, [{ item: "x", sort_order: 1 }]),
      course("Salad Bar", 2, [{ item: "y", sort_order: 1 }]),
      course("Soup", 3, [{ item: "z", sort_order: 1 }]),
    ];
    expect(parseMenuResponse(json)).toEqual([{ category: "Soup", items: ["z"] }]);
  });

  it("omits a shown course that has no items", () => {
    expect(parseMenuResponse([course("Soup", 1, [])])).toEqual([]);
  });

  it("sorts courses by course_sort and dishes by sort_order even if the input is shuffled", () => {
    const json = [
      course("Desserts", 11, [{ item: "cake", sort_order: 2 }, { item: "pie", sort_order: 1 }]),
      course("Soup", 2, [{ item: "broth", sort_order: 1 }]),
    ];
    expect(parseMenuResponse(json)).toEqual([
      { category: "Soup", items: ["broth"] },
      { category: "Desserts", items: ["pie", "cake"] },
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(parseMenuResponse([])).toEqual([]);
  });

  it.each([
    ["an object instead of an array", { message: "Resource not found" }],
    ["null", null],
    ["a course with no items array", [{ course: "Soup", course_sort: 1 }]],
    ["a dish with no item name", [course("Soup", 1, [{ sort_order: 1 } as never])]],
    ["a course with no name", [{ course_sort: 1, items: [] }]],
  ])("throws MenuFormatError for %s (never a silent empty menu)", (_name, json) => {
    expect(() => parseMenuResponse(json)).toThrow(MenuFormatError);
  });
});
