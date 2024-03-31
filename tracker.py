import datetime
import logging
import os
import smtplib
import ssl
from concurrent.futures import ThreadPoolExecutor
from email.message import EmailMessage

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

log_file_path = os.path.join(os.path.dirname(__file__), 'app.log')
with open(log_file_path, 'w') as file:
    pass
logging.basicConfig(filename=log_file_path, filemode='a', level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', datefmt='%m/%d/%Y %I:%M:%S %p')


def send_email(subject, body):
    email_sender = os.getenv('email_sender')
    email_password = os.getenv('email_password')
    email_receiver = os.getenv('email_receiver')

    em = EmailMessage()
    em['From'] = email_sender
    em['To'] = email_receiver
    em['Subject'] = subject
    em.set_content(body)

    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE

    with smtplib.SMTP_SSL('smtp.gmail.com', 465, context=context) as smtp:
        smtp.login(email_sender, email_password)
        smtp.sendmail(email_sender, email_receiver, em.as_string())


def update_price_for_product(row, options):
    with webdriver.Chrome(options=options) as browser:
        logging.info(f"Launching {browser.capabilities['browserName']} browser for product {row['url']}")

        try:
            browser.get(row['url'])
            current_price_element = WebDriverWait(browser, 15).until(EC.visibility_of_element_located((By.XPATH, row['xpath'])))
            current_price = float(current_price_element.text.replace('$', '').replace(',', '').strip())
            logging.info(f'Current price {current_price} - {browser.title}')
            updated_info = {
                'last_checked': datetime.datetime.now().strftime('%Y-%m-%d %I:%M:%S %p'),
                'status': 'ok',
                'current_price': current_price
            }
            if current_price != row['price']:
                subject = f"Price Change Detected for Product"
                body = f"The price for the product at {row['url']} has changed from ${row['price']} to ${current_price}."
                send_email(subject, body)
                logging.info(f'Email sent')
            return updated_info
        except Exception as e:
            logging.error(f"Error processing {row['url']}: {e}")
            return {'last_checked': datetime.datetime.now().strftime('%Y-%m-%d %I:%M:%S %p'), 'status': 'error'}


def update_product_prices(csv_file):
    df = pd.read_csv(csv_file)

    if 'last_checked' not in df.columns:
        df['last_checked'] = pd.NaT

    if 'status' not in df.columns:
        df['status'] = None

    options = ChromeOptions()
    options.add_argument('--start-maximized')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    options.add_argument("--disable-blink-features")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--verbose")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36")
    # options.add_argument("--headless")
    # options.add_argument("--no-sandbox")
    # options.add_argument('--disable-gpu')
    # options.add_argument('window-size=2560x1440')

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(update_price_for_product, row, options) for _, row in df.iterrows()]
        for future, (index, _) in zip(futures, df.iterrows()):
            result = future.result()
            df.at[index, 'last_checked'] = result['last_checked']
            df.at[index, 'status'] = result['status']
            if 'current_price' in result and result['status'] == 'ok':
                df.at[index, 'price'] = result['current_price']

    df.to_csv(csv_file, index=False)
    logging.info("CSV file has been updated with current prices.")


if __name__ == "__main__":
    update_product_prices('products.csv')
