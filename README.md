# Product Price Tracker

This Python script, `tracker.py`, automates the tracking of product prices on websites using Selenium with anti-detection features. It uses pandas for data handling, smtplib for sending emails, with multi-threading for reducing execution time.

## Features

- Automated price tracking with multi-threaded processing
- Smart anti-detection mechanisms and browser fingerprint modification
- Human-like browsing behavior simulation
- Automated email notifications for price changes
- Error tracking and reporting
- Retry mechanism for failed price extractions

## Requirements

To run this script, you'll need:

- Python 3.x
- Chrome browser

## Dependencies

The following Python packages are required:
```bash
pandas==2.2.1
selenium==4.18.1
fake-useragent==1.4.0
tenacity==8.2.3
```

## Installation

Install required packages:
```bash
pip install -r requirements.txt
```

## Configuration

### Environment Variables
Set up the following environment variables for email notifications:
- `email_sender`: Sender's email address
- `email_password`: Sender's email password
- `email_receiver`: Recipient's email address

### Input File Format
Create a `products.csv` file with the following columns:
- `url`: Product page URL
- `xpath`: XPath to the price element
- `price`: Current price
- `last_checked`: (Optional) Timestamp of last check
- `status`: (Optional) Status of last check

## Features in Detail

### Anti-Detection Measures
- Random user agent generation
- WebDriver flags modification
- Browser fingerprint customization
- Automated detection bypass
- Proxy support (configurable)

### Performance
- Multi-threaded processing (10 concurrent threads)
- Retry mechanism for failed requests
- Detailed execution statistics

## Usage

1. Prepare your `products.csv` file with the required information.

2. Run the script:
```bash
python3 tracker.py
```

3. Monitor the `app.log` file for detailed execution information.

## Output

The script will:
1. Update `products.csv` with the latest prices
2. Generate detailed logs in `app.log`
3. Send email notifications for:
   - Price changes
   - Error reports (if any errors occur)

## Jenkins Integration

The project includes a Jenkinsfile for automated execution in a CI/CD pipeline, which:
- Sets up a Python virtual environment
- Installs dependencies
- Runs the tracker
- Commits and pushes updates to the repository

