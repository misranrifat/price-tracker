# Product Price Tracker

This Python script, `tracker.py`, automates the tracking of product prices on websites using Selenium and notifies the user via email when there's a change in price. It employs pandas for data handling, smtplib for sending emails, and Selenium for web scraping.

## Features

- Price tracking for specified products on websites
- Automated email notifications for price changes
- Error handling and logging for easy debugging

## Requirements

To run this script, you'll need the following installed:

- Python 3.x
- Pandas
- Selenium WebDriver
- ChromeDriver (or any compatible driver for your browser)

Additionally, you will need to set up environment variables for `email_sender`, `email_password`, and `email_receiver` to enable email notifications.

## Installation

First, clone the repository to your local machine:

```bash
git clone https://github.com/marc-rifat/price-tracker.git
```

Then, navigate to the cloned directory and install the required Python packages:

```bash
pip install -r requirements.txt
```

## Setup

1. Ensure you have ChromeDriver installed and it's accessible in your system's PATH.
2. Set up the environment variables for your email configurations:
   - `email_sender`: The email address from which the notifications will be sent.
   - `email_password`: The password for the sender's email account.
   - `email_receiver`: The email address to receive the notifications.

## Usage

Run the script using Python from your terminal:

```bash
python tracker.py
```

The script expects a CSV file named `products.csv` in the same directory, containing the following columns:
- `url`: The product page URL.
- `xpath`: The XPath to the element that contains the product's price.
- `price`: The last known price (this will be updated by the script).
