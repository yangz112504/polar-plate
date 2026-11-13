/** Bowdoin couldn't be reached or answered with a server error (after retries). Shown as "Error fetching menus". */
export class MenuFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MenuFetchError";
  }
}

/** Bowdoin answered, but the JSON doesn't have the shape we expect (the site changed). Never saved as an empty menu. */
export class MenuFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MenuFormatError";
  }
}
