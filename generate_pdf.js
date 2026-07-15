const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function generatePDF(htmlFile, outputPdf) {
  console.log(`Generating ${outputPdf}...`);

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const htmlPath = path.join(__dirname, htmlFile);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Hide the language switch buttons
  await page.evaluate(() => {
    const langSwitch = document.querySelector('.lang-switcher');
    if (langSwitch) {
      langSwitch.style.display = 'none';
    }
  });

  await new Promise(resolve => setTimeout(resolve, 1000));

  // Get slide count
  const slideCount = await page.evaluate(() => {
    return document.querySelectorAll('.slide').length;
  });

  console.log(`Found ${slideCount} slides`);

  const screenshots = [];

  // Capture each slide directly by targeting the element
  for (let i = 0; i < slideCount; i++) {
    // Make sure the slide is visible
    await page.evaluate((index) => {
      const slides = document.querySelectorAll('.slide');
      // Temporarily make all slides visible
      slides.forEach((slide, idx) => {
        slide.style.scrollSnapAlign = 'none';
      });
      // Scroll to this specific slide
      const targetSlide = slides[index];
      targetSlide.scrollIntoView({ block: 'start', behavior: 'instant' });
    }, i);

    await new Promise(resolve => setTimeout(resolve, 1500));

    // Take screenshot of current viewport
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false
    });

    screenshots.push(screenshot);
    console.log(`Captured slide ${i + 1}/${slideCount}`);
  }

  await browser.close();

  // Create PDF from screenshots
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
  fs.writeFileSync(outputPdf, pdfBytes);

  console.log(`✅ PDF generated: ${outputPdf}`);
  return outputPdf;
}

(async () => {
  try {
    await generatePDF('agency_partnership_v4.html', 'agency_partnership_en.pdf');
    await generatePDF('agency_partnership_v4_tc.html', 'agency_partnership_tc.pdf');

    console.log('✅ All PDFs generated successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
