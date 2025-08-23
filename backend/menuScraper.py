from selenium import webdriver
from selenium.webdriver.common.by import By
from flask import Flask, jsonify
from flask_cors import CORS
from selenium.webdriver.chrome.options import Options

app = Flask(__name__)
CORS(app)

BOWDOIN_MENU_URL = 'https://www.bowdoin.edu/dining/menus/index.html#0'

@app.route("/api/menus")
def get_menus():
    results = scrape_menus()
    print(results)
    
    return results


def scrape_menus():
    try:
        options = Options()
        options.add_argument("--headless")  # run without opening window
        options.add_argument("--disable-gpu")
        options.add_argument("--no-sandbox")

        driver = webdriver.Chrome(options=options)
        driver.get(BOWDOIN_MENU_URL)

        # --- Thorne Data ---
        thorne_menu = {}
        thorne_menu_element = driver.find_element(By.ID, 'u49')
        thorne_children = thorne_menu_element.find_elements(By.XPATH, "./*")
        current_header = None

        for child in thorne_children:
            tag = child.tag_name.lower()
            if tag == "h3":
                current_header = child.text.strip()
                thorne_menu[current_header] = []
            elif tag == "span" and current_header:
                thorne_menu[current_header].append(child.text.strip())
            elif "No Menu Available" in child.text:
                thorne_menu = {"No Menu Available": []}
                break

        # --- Moulton Data ---
        moulton_menu = {}
        moulton_menu_element = driver.find_element(By.ID, 'u48')
        moulton_children = moulton_menu_element.find_elements(By.XPATH, "./*")
        current_header = None

        for child in moulton_children:
            tag = child.tag_name.lower()
            if tag == "h3":
                current_header = child.text.strip()
                moulton_menu[current_header] = []
            elif tag == "span" and current_header:
                moulton_menu[current_header].append(child.text.strip())
            elif "No Menu Available" in child.text:
                moulton_menu = {"No Menu Available": []}
                break

        # remove first date header (if present)
        if len(moulton_menu) > 1:
            moulton_menu.pop(next(iter(moulton_menu)))
        if len(thorne_menu) > 1:
            thorne_menu.pop(next(iter(thorne_menu)))

        results = {
            "Thorne": [{"category": category, "items": foods} for category, foods in thorne_menu.items()],
            "Moulton": [{"category": category, "items": foods} for category, foods in moulton_menu.items()],
        }
        return results

    except Exception as e:
        print("Error scraping menus:", e)
        return {"error": str(e)}

    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    app.run(port=5002, debug=True)
