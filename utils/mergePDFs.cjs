const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function mergePDFs(inputDir, outputPath) {
  const files = fs
    .readdirSync(inputDir)
    .filter(file => file.endsWith('.pdf'))
    .map(file => path.join(inputDir, file));

  if (files.length === 0) return;

  const mergedPdf = await PDFDocument.create();

  for (const filePath of files) {
    const fileBuffer = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(fileBuffer);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }

  const mergedPdfBytes = await mergedPdf.save();
  fs.writeFileSync(outputPath, mergedPdfBytes);
}

module.exports = { mergePDFs };
