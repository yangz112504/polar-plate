// routes/menus.js
const express = require("express");
const { chromium } = require("playwright");

const router = express.Router();
const BOWDOIN_MENU_URL = "https://www.bowdoin.edu/dining/menus/index.html#0";

router.get("/", async (req, res) => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(BOWDOIN_MENU_URL, { waitUntil: "networkidle" });

    // Thorne Data
    const thorneMenu = await page.$eval("#u49", (el) => {
      const children = Array.from(el.children);
      const menu = {};
      let currentHeader = null;

      for (const child of children) {
        const tag = child.tagName.toLowerCase();
        const text = child.textContent.trim();

        if (tag === "h3") {
          currentHeader = text;
          menu[currentHeader] = [];
        } else if (tag === "span" && currentHeader) {
          menu[currentHeader].push(text);
        } else if (text.includes("No Menu Available")) {
          return { "No Menu Available": [] };
        }
      }

      if (Object.keys(menu).length > 1) delete menu[Object.keys(menu)[0]];
      return menu;
    });

    // Moulton Data
    const moultonMenu = await page.$eval("#u48", (el) => {
      const children = Array.from(el.children);
      const menu = {};
      let currentHeader = null;

      for (const child of children) {
        const tag = child.tagName.toLowerCase();
        const text = child.textContent.trim();

        if (tag === "h3") {
          currentHeader = text;
          menu[currentHeader] = [];
        } else if (tag === "span" && currentHeader) {
          menu[currentHeader].push(text);
        } else if (text.includes("No Menu Available")) {
          return { "No Menu Available": [] };
        }
      }

      if (Object.keys(menu).length > 1) delete menu[Object.keys(menu)[0]];
      return menu;
    });

    res.json({
      Thorne: Object.entries(thorneMenu).map(([category, items]) => ({ category, items })),
      Moulton: Object.entries(moultonMenu).map(([category, items]) => ({ category, items })),
    });
  } catch (err) {
    console.error("Playwright scraping error:", err);
    res.status(500).json({ error: "Failed to scrape menus" });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;

