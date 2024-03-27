import datetime
import logging
import os
import smtplib
import ssl
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
logging.basicConfig(filename=log_file_path, filemode='a', level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')


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
        logging.info(f'Email sent to {email_receiver}')


def update_product_prices(csv_file):
    df = pd.read_csv(csv_file)

    if 'last_checked' not in df.columns:
        df['last_checked'] = pd.NaT

    if 'status' not in df.columns:
        df['status'] = None
        df['status'] = df['status'].astype('str')

    options = ChromeOptions()
    options.add_argument("--headless")
    options.add_argument('window-size=2560x1440')
    browser = webdriver.Chrome(options=options)
    logging.info(f"Launching {browser.capabilities['browserName']} browser")
    logging.info(f"Browser version: {browser.capabilities.get('browserVersion') or browser.capabilities.get('version')}\n")

    for index, row in df.iterrows():
        try:
            browser.get(row['url'])
            logging.info(browser.title)
            current_price_element = WebDriverWait(browser, 35).until(EC.visibility_of_element_located((By.XPATH, row['xpath'])))
            current_price = float(current_price_element.text.replace('$', '').replace(',', '').replace('US', '').strip())
            logging.info(f'Current_price {current_price}')

            df.at[index, 'last_checked'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            logging.info('Updated last_checked')
            df.at[index, 'status'] = 'ok'
            logging.info('Updated status\n')

            if current_price != row['price']:
                subject = f"Price Change Detected for Product"
                body = f"The price for the product at {row['url']} has changed from ${row['price']} to ${current_price}."
                send_email(subject, body)
                logging.info(f'Email sent')

                logging.info(f"Updating price for {row['url']}: was {row['price']}, now {current_price}")
                df.at[index, 'price'] = current_price
                logging.info('Updated price\n')
        except Exception as e:
            logging.error(f"Error processing {row['url']}: {e}")
            df.at[index, 'last_checked'] = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            logging.error('Updated last_checked')
            df.at[index, 'status'] = 'error'
            logging.error('Updated status\n')

    browser.quit()
    logging.info('Browser closed')

    df.to_csv(csv_file, index=False)
    logging.info("CSV file has been updated with current prices.")


update_product_prices('products.csv')
