import datetime
import logging
import os
import smtplib
import ssl
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage
import random
import time
import traceback
from dataclasses import dataclass
from typing import Optional

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from fake_useragent import UserAgent
from tenacity import retry, stop_after_attempt, wait_exponential

log_file_path = os.path.join(os.path.dirname(__file__), "app.log")
with open(log_file_path, "w") as file:
    pass
logging.basicConfig(
    filename=log_file_path,
    filemode="a",
    level=logging.INFO,
    format="%(asctime)s - [%(threadName)s] - %(levelname)s - %(message)s",
    datefmt="%m/%d/%Y %I:%M:%S %p",
)


def send_email(subject, body):
    email_sender = os.getenv("email_sender")
    email_password = os.getenv("email_password")
    email_receiver = os.getenv("email_receiver")

    em = EmailMessage()
    em["From"] = email_sender
    em["To"] = email_receiver
    em["Subject"] = subject
    em.set_content(body)

    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as smtp:
        smtp.login(email_sender, email_password)
        smtp.sendmail(email_sender, email_receiver, em.as_string())


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
def get_price_with_retry(browser, xpath):
    current_price_element = WebDriverWait(browser, 15).until(
        EC.visibility_of_element_located((By.XPATH, xpath))
    )
    return float(current_price_element.text.replace("$", "").replace(",", "").strip())


def simulate_human_behavior(browser):
    """Simulate more realistic human browsing behavior."""
    # Random initial scroll position
    scroll_position = random.randint(300, 700)
    browser.execute_script(f"window.scrollTo(0, {scroll_position});")
    time.sleep(random.uniform(0.5, 1.5))

    # Random mouse movements (using JavaScript)
    for _ in range(random.randint(2, 5)):
        x = random.randint(100, 800)
        y = random.randint(100, 600)
        browser.execute_script(
            f"""
            var e = document.createElement("div");
            e.style.position = "absolute";
            e.style.left = "{x}px";
            e.style.top = "{y}px";
            document.body.appendChild(e);
            e.scrollIntoView({{behavior: "smooth", block: "center"}});
        """
        )
        time.sleep(random.uniform(0.3, 0.7))


@dataclass
class ScrapingError:
    url: str
    error_type: str
    error_message: str
    stack_trace: str
    timestamp: str


class ErrorTracker:
    def __init__(self):
        self.errors = []

    def add_error(self, url: str, error: Exception):
        self.errors.append(
            ScrapingError(
                url=url,
                error_type=type(error).__name__,
                error_message=str(error),
                stack_trace=traceback.format_exc(),
                timestamp=datetime.datetime.now().strftime("%Y-%m-%d %I:%M:%S %p"),
            )
        )

    def get_error_report(self) -> str:
        if not self.errors:
            return "No errors occurred during scraping."

        report = ["Scraping Error Report:", ""]
        for error in self.errors:
            report.extend(
                [
                    f"URL: {error.url}",
                    f"Error Type: {error.error_type}",
                    f"Error Message: {error.error_message}",
                    f"Timestamp: {error.timestamp}",
                    "Stack Trace:",
                    error.stack_trace,
                    "-" * 80,
                    "",
                ]
            )
        return "\n".join(report)


def update_price_for_product(row, options):
    with webdriver.Chrome(options=options) as browser:
        # Execute CDP commands to modify browser fingerprint
        browser.execute_cdp_cmd(
            "Network.setUserAgentOverride",
            {
                "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
        )

        # Modify webdriver flags
        browser.execute_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        logging.info(f"Launching headless Chrome for product {row['url']}")

        try:
            browser.get(row["url"])
            simulate_human_behavior(browser)

            # Use retry mechanism for price extraction
            current_price = get_price_with_retry(browser, row["xpath"])
            logging.info(f"Current price {current_price} - {browser.title}")

            updated_info = {
                "last_checked": datetime.datetime.now().strftime(
                    "%Y-%m-%d %I:%M:%S %p"
                ),
                "status": "ok",
                "current_price": current_price,
            }

            if current_price != row["price"]:
                subject = f"Price Changed from ${row['price']} to ${current_price}"
                body = f"The price for the product at {row['url']} has changed from ${row['price']} to ${current_price}."
                send_email(subject, body)
                logging.info(f"Email sent")

            return updated_info

        except Exception as e:
            logging.error(f"Error processing {row['url']}: {e}")
            return {
                "last_checked": datetime.datetime.now().strftime(
                    "%Y-%m-%d %I:%M:%S %p"
                ),
                "status": "error",
            }


def update_product_prices(csv_file):
    start_time = time.time()  # Start timing
    products_processed = 0  # Counter for processed products

    error_tracker = ErrorTracker()
    df = pd.read_csv(csv_file)
    total_products = len(df)

    if "last_checked" not in df.columns:
        df["last_checked"] = pd.NaT

    if "status" not in df.columns:
        df["status"] = None

    options = ChromeOptions()

    # Add random user agent
    ua = UserAgent()
    user_agent = ua.random
    options.add_argument(f"--user-agent={user_agent}")

    # Add proxy support
    # options.add_argument('--proxy-server=http://proxy-address:port')

    # Headless mode configuration
    options.add_argument("--headless=new")  # New headless mode implementation
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")

    # Window size and basic configuration
    options.add_argument("--window-size=2560x1440")
    options.add_argument("--start-maximized")

    # Advanced automation detection bypass
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    # Realistic browser profile
    options.add_argument(
        f"--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-infobars")

    # Additional stealth settings
    prefs = {
        "credentials_enable_service": False,
        "profile.password_manager_enabled": False,
        "profile.default_content_setting_values.notifications": 2,
        "webrtc.ip_handling_policy": "disable_non_proxied_udp",
        "webrtc.multiple_routes_enabled": False,
        "webrtc.nonproxied_udp_enabled": False,
    }
    options.add_experimental_option("prefs", prefs)

    with ThreadPoolExecutor(max_workers=10, thread_name_prefix="Thread") as executor:
        futures = [
            executor.submit(update_price_for_product, row, options)
            for _, row in df.iterrows()
        ]
        for future, (index, _) in zip(futures, df.iterrows()):
            result = future.result()
            df.at[index, "last_checked"] = result["last_checked"]
            df.at[index, "status"] = result["status"]
            if "current_price" in result and result["status"] == "ok":
                df.at[index, "price"] = result["current_price"]
            products_processed += 1

            # Log progress every 5 products or when all products are processed
            if products_processed % 5 == 0 or products_processed == total_products:
                elapsed_time = time.time() - start_time
                avg_time_per_product = elapsed_time / products_processed
                remaining_products = total_products - products_processed
                estimated_remaining_time = remaining_products * avg_time_per_product

                logging.info(
                    f"Progress: {products_processed}/{total_products} products processed "
                    f"({(products_processed/total_products)*100:.1f}%) | "
                    f"Elapsed: {elapsed_time:.1f}s | "
                    f"Avg: {avg_time_per_product:.1f}s per product | "
                    f"Est. remaining: {estimated_remaining_time:.1f}s"
                )

    df.to_csv(csv_file, index=False)

    # Final timing information
    total_time = time.time() - start_time
    logging.info(
        f"\nExecution completed:"
        f"\n- Total time: {total_time:.1f} seconds"
        f"\n- Average time per product: {total_time/total_products:.1f} seconds"
        f"\n- Products processed: {products_processed}"
    )

    # After processing all products:
    error_report = error_tracker.get_error_report()
    logging.info(error_report)
    if error_tracker.errors:
        send_email("Scraping Error Report", error_report)


if __name__ == "__main__":
    update_product_prices("products.csv")
