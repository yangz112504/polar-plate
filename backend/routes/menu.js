// routes/menus.js
const express = require("express");
const { chromium } = require("playwright");

const router = express.Router();
const BOWDOIN_MENU_URL = "https://www.bowdoin.edu/dining/menus/index.html#0";

router.get("/:meal", async (req, res) => {
  let browser;

  const { meal } = req.params; // e.g. Breakfast, Lunch, Dinner, Brunch

  // Map meals to button IDs
  const mealButtonIds = {
    Breakfast: "#breakfastl",
    Brunch: "#brunchl",
    Lunch: "#lunchl",
    Dinner: "#dinnerl",
  };

  if (!mealButtonIds[meal]) {
    return res.status(400).json({ error: "Invalid meal parameter" });
  }
  
  try {
    // browser = await chromium.launch({ headless: true });
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto(BOWDOIN_MENU_URL, { waitUntil: "networkidle" });

    await page.click(mealButtonIds[meal]);
    
    await Promise.all([
      page.waitForSelector("#u49 h3, #u49 span, #u49", { timeout: 5000 }),
      page.waitForSelector("#u48 h3, #u48 span, #u48", { timeout: 5000 }),
    ]);

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

    console.log(thorneMenu)
    console.log(moultonMenu)

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

