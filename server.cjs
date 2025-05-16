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

// Utility: Clean or create folder
const cleanFolder = (folder) => {
  if (fs.existsSync(folder)) {
    fs.readdirSync(folder).forEach(file => fs.unlinkSync(path.join(folder, file)));
  } else {
    fs.mkdirSync(folder, { recursive: true });
  }
};

// Utility: Download PDF file from URL
const downloadPDF = async (pdfUrl, filePath) => {
  const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
  fs.writeFileSync(filePath, response.data);
};

app.post('/generate-pdf', async (req, res) => {
  const { startRoll, endRoll, websiteURL } = req.body;
  const notFound = [];

  if (!startRoll || !endRoll || !websiteURL) {
    return res.status(400).json({ error: 'Missing required fields: startRoll, endRoll, websiteURL' });
  }

  const prefix = startRoll.slice(0, startRoll.length - 4);
  const startNum = parseInt(startRoll.slice(-4));
  const endNum = parseInt(endRoll.slice(-4));

  cleanFolder(downloadsDir);
  cleanFolder(mergedDir);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    for (let i = startNum; i <= endNum; i++) {
      const roll = `${prefix}${i.toString().padStart(4, '0')}`;
      console.log(`➡️ Processing Roll No: ${roll}`);

      try {
        await page.goto(websiteURL, { waitUntil: 'networkidle2' });

        // Adjust these selectors to your actual page form
        await page.waitForSelector('#txtRollNo');
        await page.evaluate(() => (document.querySelector('#txtRollNo').value = ''));

        await page.type('#txtRollNo', roll);
        await page.click('#btnGetResult');

        console.log(`⏳ Waiting for result...`);

        await page.waitForSelector('#lblName', { timeout: 4000 }); // Adjust selector for result confirmation

        console.log(`✅ Result found for ${roll}`);

        // Extract PDF URL - adjust selector to actual download link/button
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
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
