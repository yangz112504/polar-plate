import type { MenuCategory } from "../db/schema";
import { MenuFormatError } from "./errors";

/**
 * Courses shown on Bowdoin's own menu page (copied from their dining-menu.js).
 * Anything else, such as "Salad Bar", "Deli Bar" or "Fresh Fruit", is hidden on their page, so we hide it too.
 */
const COURSES_TO_SHOW = new Set([
  "Soup", "Salads", "Main Course", "Starches", "Vegetables", "Display", "Desserts", "Deli", "Grab and Go",
]);

type RawItem = { item: string; sort_order: number };
type RawCourse = { course: string | null; course_sort: number; items: RawItem[] };

/** Narrows unknown JSON to a plain object, or throws a format error naming what was expected. */
function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MenuFormatError(`Expected ${what} to be an object`);
  }
  return value as Record<string, unknown>;
}

/** Validates one dish entry; Bowdoin's field names live only in this file. */
function parseItem(value: unknown): RawItem {
  const raw = asRecord(value, "a menu item");
  if (typeof raw.item !== "string") throw new MenuFormatError("Menu item has no 'item' name");
  return { item: raw.item, sort_order: typeof raw.sort_order === "number" ? raw.sort_order : 0 };
}

/** Validates one course entry. A null course name is allowed (Bowdoin uses it for unnamed groups) and dropped later. */
function parseCourse(value: unknown): RawCourse {
  const raw = asRecord(value, "a course");
  const name = raw.course;
  if (name !== null && typeof name !== "string") throw new MenuFormatError("Course has no 'course' name");
  if (!Array.isArray(raw.items)) throw new MenuFormatError("Course has no 'items' array");
  return {
    course: name,
    course_sort: typeof raw.course_sort === "number" ? raw.course_sort : 0,
    items: raw.items.map(parseItem),
  };
}

/**
 * Turns Bowdoin's menu JSON into our stored shape, keeping only the courses shown on
 * Bowdoin's own menu page and dropping empty courses.
 * @param json The parsed JSON body from the dining-menu endpoint (untrusted).
 * @returns Categories ordered by course_sort, each with its dish names ordered by sort_order.
 * @throws MenuFormatError if the JSON isn't the expected array of courses with items.
 */
export function parseMenuResponse(json: unknown): MenuCategory[] {
  if (!Array.isArray(json)) throw new MenuFormatError("Expected the menu to be an array of courses");

  // Validate everything first so a changed structure is noticed even in hidden courses.
  const courses = json.map(parseCourse);

  return courses
    .filter((c) => c.course !== null && COURSES_TO_SHOW.has(c.course) && c.items.length > 0)
    // Array.prototype.sort is stable, so equal course_sort values keep Bowdoin's order.
    .sort((a, b) => a.course_sort - b.course_sort)
    .map((c) => ({
      category: c.course as string,
      items: [...c.items].sort((a, b) => a.sort_order - b.sort_order).map((i) => i.item),
    }));
}
