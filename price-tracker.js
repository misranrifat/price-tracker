const puppeteer = require('puppeteer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const moment = require('moment');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

const inputFile = 'products.csv';
const outputFile = 'products.csv';
const NUM_THREADS = 8;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const MIN_DELAY = 2000;  // Minimum delay between requests
const MAX_DELAY = 5000;  // Maximum delay between requests
const RATE_LIMIT_DELAY = 60000;  // 1 minute delay if rate limited

// Price alert thresholds
const PRICE_DECREASE_ALERT_THRESHOLD = 0.1; // 10% decrease
const PRICE_INCREASE_ALERT_THRESHOLD = 0.2; // 20% increase
const ALERT_LOG_FILE = 'price_alerts.log';

// Configure proxy list - add your proxies here
const PROXY_LIST = [
    // Example: 'http://username:password@proxy.example.com:8080'
];

function getRandomProxy() {
    return PROXY_LIST.length > 0 ? PROXY_LIST[Math.floor(Math.random() * PROXY_LIST.length)] : null;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getRandomDelay() {
    return Math.floor(Math.random() * (MAX_DELAY - MIN_DELAY + 1)) + MIN_DELAY;
}

// Data validation
function validateProduct(product) {
    if (!product.url || !product.url.startsWith('http')) {
        throw new Error(`Invalid URL format: ${product.url}`);
    }
    
    if (product.current_price && isNaN(parseFloat(product.current_price))) {
        throw new Error(`Invalid price format: ${product.current_price}`);
    }
    
    if (product.xpath && typeof product.xpath !== 'string') {
        throw new Error(`Invalid xpath format: ${product.xpath}`);
    }
    
    return true;
}

function logPriceAlert(product, oldPrice, newPrice, changePercent) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
    const message = `[${timestamp}] Price ${newPrice > oldPrice ? 'increased' : 'decreased'} for ${product.url}\n` +
                   `Old price: $${oldPrice}\n` +
                   `New price: $${newPrice}\n` +
                   `Change: ${changePercent.toFixed(2)}%\n\n`;
    
    fs.appendFileSync(ALERT_LOG_FILE, message);
    console.log('\n🚨 Price Alert:', message);
}

// Worker thread code
if (!isMainThread) {
    const { url, xpath } = workerData;
    console.log(`Worker started for: ${url}`);

    async function scrapePrice(retryCount = 0) {
        let browser = null;
        try {
            // Add random delay before starting
            const delay = await getRandomDelay();
            console.log(`[${url}] Waiting ${delay}ms before starting...`);
            await sleep(delay);

            console.log(`[${url}] Launching browser... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
            const proxy = getRandomProxy();
            const launchOptions = {
                headless: 'new',
                defaultViewport: {
                    width: 1920,
                    height: 1080
                },
                args: [
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            };
            
            if (proxy) {
                launchOptions.args.push(`--proxy-server=${proxy}`);
            }
            
            browser = await puppeteer.launch(launchOptions);

            const pages = await browser.pages();
            const page = pages[0];

            console.log(`[${url}] Setting up browser configurations...`);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            });

            await page.setJavaScriptEnabled(true);
            await page.setDefaultNavigationTimeout(60000);

            console.log(`[${url}] Navigating to page...`);
            const response = await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 60000
            });

            // Check for rate limiting or blocking
            if (response.status() === 429 || response.status() === 403) {
                throw new Error(`Rate limited or blocked (Status: ${response.status()})`);
            }

            console.log(`[${url}] Waiting for page to stabilize...`);
            await new Promise(resolve => setTimeout(resolve, 5000));

            console.log(`[${url}] Attempting to extract price...`);
            const priceText = await page.evaluate(async (xpath) => {
                const priceElement = document.querySelector('.priceView-hero-price span[aria-hidden="true"]');
                if (priceElement) return priceElement.textContent;

                const xpathResult = document.evaluate(
                    xpath,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );
                const xpathElement = xpathResult.singleNodeValue;
                if (xpathElement) return xpathElement.textContent;

                const anyPriceElement = document.querySelector('[data-testid="customer-price"] span');
                if (anyPriceElement) return anyPriceElement.textContent;

                return null;
            }, xpath);

            if (priceText) {
                console.log(`[${url}] Successfully found price: ${priceText}`);
                const price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                
                // Validate price
                if (isNaN(price) || price <= 0) {
                    throw new Error(`Invalid price value: ${priceText}`);
                }
                
                parentPort.postMessage({ success: true, price });
            } else {
                throw new Error('Price element not found');
            }
        } catch (error) {
            console.error(`[${url}] Error: ${error.message}`);
            
            if (error.message.includes('Rate limited') && retryCount < MAX_RETRIES - 1) {
                console.log(`[${url}] Rate limited. Waiting ${RATE_LIMIT_DELAY}ms before retry...`);
                if (browser) {
                    await browser.close();
                }
                await sleep(RATE_LIMIT_DELAY);
                return scrapePrice(retryCount + 1);
            }
            
            if (retryCount < MAX_RETRIES - 1) {
                console.log(`[${url}] Retrying after ${RETRY_DELAY}ms...`);
                if (browser) {
                    await browser.close();
                }
                await sleep(RETRY_DELAY);
                return scrapePrice(retryCount + 1);
            }
            
            parentPort.postMessage({ success: false });
        } finally {
            if (browser) {
                console.log(`[${url}] Closing browser`);
                await browser.close();
            }
        }
    }

    scrapePrice();
}
// Main thread code
else {
    console.log('Starting price tracker with multi-threading...');
    console.log(`Number of threads: ${NUM_THREADS}`);

    const csvWriter = createCsvWriter({
        path: outputFile,
        header: [
            { id: 'url', title: 'url' },
            { id: 'xpath', title: 'xpath' },
            { id: 'current_price', title: 'current_price' },
            { id: 'last_updated', title: 'last_updated' },
            { id: 'price_changed', title: 'price_changed' },
            { id: 'status', title: 'status' }
        ]
    });

    async function createWorker(product) {
        console.log(`Creating worker for: ${product.url}`);
        return new Promise((resolve) => {
            try {
                // Validate product data before processing
                validateProduct(product);
                
                const worker = new Worker(__filename, {
                    workerData: {
                        url: product.url,
                        xpath: product.xpath
                    }
                });

                worker.on('message', (result) => {
                    if (result.success) {
                        const oldPrice = parseFloat(product.current_price);
                        const newPrice = result.price;
                        const priceChanged = oldPrice !== newPrice ? 'yes' : 'no';
                        
                        // Calculate price change percentage
                        if (oldPrice > 0 && newPrice !== oldPrice) {
                            const changePercent = ((newPrice - oldPrice) / oldPrice) * 100;
                            
                            // Check for significant price changes
                            if (changePercent <= -PRICE_DECREASE_ALERT_THRESHOLD * 100 || 
                                changePercent >= PRICE_INCREASE_ALERT_THRESHOLD * 100) {
                                logPriceAlert(product, oldPrice, newPrice, changePercent);
                            }
                        }
                        
                        console.log(`Price update for ${product.url}: ${oldPrice} -> ${newPrice} (Changed: ${priceChanged})`);
                        resolve({
                            url: product.url,
                            xpath: product.xpath,
                            current_price: newPrice.toFixed(2),
                            last_updated: moment().format('YYYY-MM-DD HH:mm:ss'),
                            price_changed: priceChanged,
                            status: 'ok'
                        });
                    } else {
                        console.log(`Failed to get price for ${product.url}, keeping old values`);
                        resolve({
                            url: product.url,
                            xpath: product.xpath,
                            current_price: product.current_price,
                            last_updated: moment().format('YYYY-MM-DD HH:mm:ss'),
                            price_changed: product.price_changed || 'no',
                            status: 'fail'
                        });
                    }
                });

                worker.on('error', (error) => {
                    console.error(`Worker error for ${product.url}: ${error.message}`);
                    resolve({
                        url: product.url,
                        xpath: product.xpath,
                        current_price: product.current_price,
                        last_updated: moment().format('YYYY-MM-DD HH:mm:ss'),
                        price_changed: product.price_changed || 'no',
                        status: 'fail'
                    });
                });
            } catch (error) {
                console.error(`Validation error for ${product.url}: ${error.message}`);
                resolve({
                    url: product.url,
                    xpath: product.xpath,
                    current_price: product.current_price,
                    last_updated: moment().format('YYYY-MM-DD HH:mm:ss'),
                    price_changed: product.price_changed || 'no',
                    status: 'validation_error'
                });
            }
        });
    }

    async function processInBatches(products, batchSize) {
        const results = [];
        const totalBatches = Math.ceil(products.length / batchSize);

        console.log(`Processing ${products.length} products in ${totalBatches} batches of ${batchSize}`);

        for (let i = 0; i < products.length; i += batchSize) {
            const batchNumber = Math.floor(i / batchSize) + 1;
            console.log(`\nStarting batch ${batchNumber}/${totalBatches}`);

            const batch = products.slice(i, i + batchSize);
            console.log(`Batch ${batchNumber} products:`, batch.map(p => p.url).join('\n'));

            const batchPromises = batch.map(product => createWorker(product));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Add delay between batches
            if (i + batchSize < products.length) {
                const batchDelay = await getRandomDelay();
                console.log(`Waiting ${batchDelay}ms before starting next batch...`);
                await sleep(batchDelay);
            }

            console.log(`Completed batch ${batchNumber}/${totalBatches}`);
        }
        return results;
    }

    async function updatePrices() {
        console.log('Reading CSV file...');
        const products = [];

        await new Promise((resolve, reject) => {
            fs.createReadStream(inputFile)
                .pipe(csv())
                .on('data', (row) => products.push(row))
                .on('end', () => {
                    console.log(`Loaded ${products.length} products from CSV`);
                    resolve();
                })
                .on('error', reject);
        });

        console.log('\nStarting price updates...');
        const updatedProducts = await processInBatches(products, NUM_THREADS);

        console.log('\nWriting updated data to CSV...');
        await csvWriter.writeRecords(updatedProducts);
        console.log('Price tracking completed successfully!');
    }

    updatePrices().catch(error => {
        console.error('Error in main process:', error);
    });
} 