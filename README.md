# Price Tracker

A Node.js application that tracks product prices using Puppeteer. The application supports multi-threaded price checking and maintains price history in a CSV file.

## Features

- Multi-threaded processing (8 concurrent checks by default)
- Automated price checking with configurable batch sizes
- Headless browser automation using Puppeteer

## Prerequisites

- **Node.js** (v14 or higher)
- **npm**

## Installation

Install dependencies:

```sh
npm install
```

## Usage

Run the price tracker:

```sh
node price-tracker.js
```

## Configuration

The application reads product information from `products.csv`. Each row should contain:

- **Product XPATH**
- **Product URL**