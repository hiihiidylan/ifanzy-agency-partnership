const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDir = path.join(__dirname, 'outputs', 'pdf');

async function generatePDF(htmlFile, outputPdf) {
  console.log(`Generating ${outputPdf}...`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

  const htmlPath = path.join(__dirname, 'mobile', htmlFile);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  await page.evaluate(() => {
    const langSwitch = document.querySelector('.lang-switcher');
    if (langSwitch) {
      langSwitch.style.display = 'none';
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const slideCount = await page.evaluate(() => document.querySelectorAll('.slide').length);
  console.log(`Found ${slideCount} slides`);

  const screenshots = [];

  for (let i = 0; i < slideCount; i += 1) {
    await page.evaluate((index) => {
      const slides = document.querySelectorAll('.slide');
      slides.forEach((slide) => {
        slide.style.scrollSnapAlign = 'none';
      });
      slides[index].scrollIntoView({ block: 'start', behavior: 'instant' });
    }, i);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    screenshots.push(screenshot);
    console.log(`Captured slide ${i + 1}/${slideCount}`);
  }

  await browser.close();

  fs.mkdirSync(outputDir, { recursive: true });

  const pdfDoc = await PDFDocument.create();

  for (const screenshot of screenshots) {
    const image = await pdfDoc.embedPng(screenshot);
    const pdfPage = pdfDoc.addPage([1920, 1080]);
    pdfPage.drawImage(image, {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(outputDir, outputPdf);
  fs.writeFileSync(outputPath, pdfBytes);

  console.log(`PDF generated: ${outputPath}`);
  return outputPath;
}

(async () => {
  try {
    await generatePDF('agency_partnership_mobile.html', 'agency_partnership_mobile_en.pdf');
    await generatePDF('agency_partnership_mobile_tc.html', 'agency_partnership_mobile_tc.pdf');
    console.log('All mobile PDFs generated successfully.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
