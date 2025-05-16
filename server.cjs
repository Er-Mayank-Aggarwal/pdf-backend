const express = require('express');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const cors = require('cors');
const axios = require('axios');
const { mergePDFs } = require('./utils/mergePDFs.cjs');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve merged PDFs statically
app.use('/merged', express.static(path.join(__dirname, 'merged')));

const downloadsDir = path.join(__dirname, 'downloads');
const mergedDir = path.join(__dirname, 'merged');

const cleanFolder = (folder) => {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  } else {
    fs.readdirSync(folder).forEach(file => {
      fs.unlinkSync(path.join(folder, file));
    });
  }
};

const downloadPDF = async (pdfUrl, filePath) => {
  const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, response.data);
};

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

app.post('/generate-pdf', async (req, res) => {
  const { startRoll, endRoll, websiteURL } = req.body;

  if (!startRoll || !endRoll || !websiteURL) {
    return res.status(400).json({ error: 'Missing required fields: startRoll, endRoll, websiteURL' });
  }

  const notFound = [];
  const prefix = startRoll.slice(0, startRoll.length - 4);
  const startNum = parseInt(startRoll.slice(-4));
  const endNum = parseInt(endRoll.slice(-4));

  cleanFolder(downloadsDir);
  cleanFolder(mergedDir);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
      ],
    });

    const page = await browser.newPage();

    for (let i = startNum; i <= endNum; i++) {
      const roll = `${prefix}${i.toString().padStart(4, '0')}`;
      console.log(`➡️ Processing Roll No: ${roll}`);

      try {
        await page.goto(websiteURL, { waitUntil: 'networkidle2' });

        // Clear and type roll number into input
        await page.waitForSelector('#txtRollNo');
        await page.evaluate(() => (document.querySelector('#txtRollNo').value = ''));
        await page.type('#txtRollNo', roll);

        // Click the submit button
        await page.click('#btnGetResult');

        console.log(`⏳ Waiting for result...`);

        // Wait for result element (adjust timeout as needed)
        await page.waitForSelector('#lblName', { timeout: 10000 });

        console.log(`✅ Result found for ${roll}`);

        // Extract PDF URL (adjust selector based on your actual site)
        const pdfUrl = await page.evaluate(() => {
          const link = document.querySelector('a[href$=".pdf"]');
          return link ? link.href : null;
        });

        if (!pdfUrl) throw new Error('PDF URL not found');

        const pdfPath = path.join(downloadsDir, `${roll}.pdf`);
        await downloadPDF(pdfUrl, pdfPath);
        console.log(`📄 Downloaded: ${roll}.pdf`);

      } catch (err) {
        console.error(`❌ Failed for ${roll}: ${err.message}`);
        notFound.push(roll);
      }
    }

    await browser.close();

    const mergedPath = path.join(mergedDir, 'Final_Merged.pdf');
    await mergePDFs(downloadsDir, mergedPath);
    console.log(`✅ Merged PDF created at: ${mergedPath}`);

    res.json({
      downloadURL: `/merged/Final_Merged.pdf`,
      notFound,
    });

  } catch (err) {
    if (browser) await browser.close();
    console.error('❌ Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
