const puppeteer = require('puppeteer');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const fs = require('fs');
const moment = require('moment');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

const inputFile = 'products.csv';
const outputFile = 'products.csv';
const NUM_THREADS = 8; // Adjust this number based on your CPU cores

// Worker thread code
if (!isMainThread) {
    const { url, xpath } = workerData;
    console.log(`Worker started for: ${url}`);

    async function scrapePrice() {
        let browser = null;
        try {
            console.log(`[${url}] Launching browser...`);
            browser = await puppeteer.launch({
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
            });

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
            await page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 60000
            });

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
                parentPort.postMessage({ success: true, price });
            } else {
                console.log(`[${url}] Failed to find price element`);
                parentPort.postMessage({ success: false });
            }
        } catch (error) {
            console.error(`[${url}] Error: ${error.message}`);
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