const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outputDir = path.join(__dirname, 'outputs', 'pdf');

function resolveHtmlPath(htmlFile) {
  const mobilePath = path.join(__dirname, 'mobile', htmlFile);
  if (fs.existsSync(mobilePath)) {
    return mobilePath;
  }
  return path.join(__dirname, htmlFile);
}

async function generatePDF(htmlFile, outputPdf, options = {}) {
  const width = options.width || 1920;
  const height = options.height || 1080;
  const pdfWidth = options.pdfWidth || width;
  const pdfHeight = options.pdfHeight || height;
  console.log(`Generating ${outputPdf}...`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width,
    height,
    deviceScaleFactor: options.deviceScaleFactor || 1,
  });

  const htmlPath = resolveHtmlPath(htmlFile);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  await page.evaluate((applyPdfLayoutFixes) => {
    const langSwitch = document.querySelector('.lang-switcher');
    if (langSwitch) {
      langSwitch.style.display = 'none';
    }
    if (applyPdfLayoutFixes) {
      document.documentElement.classList.add('pdf-export');
      const style = document.createElement('style');
      style.textContent = `
        html[lang="zh-Hant"].pdf-export .partnership-copy.partnership-copy-tc h2 {
          font-size:83px !important;
          line-height:1.02 !important;
        }
        html[lang="en"].pdf-export .advantages-copy h2 {
          font-size:82px !important;
          line-height:.98 !important;
          letter-spacing:-.06em !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, options.pdfLayoutFixes === true);

  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

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

    const slideFrame = options.cropToSlide
      ? await page.evaluate((index) => {
          const rect = document.querySelectorAll('.slide')[index].getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
          };
        }, i)
      : null;

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    });

    screenshots.push({ screenshot, slideFrame });
    console.log(`Captured slide ${i + 1}/${slideCount}`);
  }

  await browser.close();

  fs.mkdirSync(outputDir, { recursive: true });

  const pdfDoc = await PDFDocument.create();

  for (const { screenshot, slideFrame } of screenshots) {
    const image = await pdfDoc.embedPng(screenshot);
    const pdfPage = pdfDoc.addPage([pdfWidth, pdfHeight]);

    if (slideFrame) {
      const scaleX = pdfWidth / slideFrame.width;
      const scaleY = pdfHeight / slideFrame.height;
      const bottomSpace = slideFrame.viewportHeight - slideFrame.top - slideFrame.height;
      pdfPage.drawImage(image, {
        x: -slideFrame.left * scaleX,
        y: -bottomSpace * scaleY,
        width: slideFrame.viewportWidth * scaleX,
        height: slideFrame.viewportHeight * scaleY,
      });
    } else {
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pdfWidth,
        height: pdfHeight,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = path.join(outputDir, outputPdf);
  fs.writeFileSync(outputPath, pdfBytes);

  console.log(`PDF generated: ${outputPath}`);
  return outputPath;
}

(async () => {
  try {
    const fourByThreeOnly = process.argv.includes('--4x3-only');
    const fourByThreeTcOnly = process.argv.includes('--4x3-tc-only');
    if (!fourByThreeOnly && !fourByThreeTcOnly) {
      await generatePDF('agency_partnership_mobile.html', 'agency_partnership_mobile_en.pdf');
      await generatePDF('agency_partnership_mobile_tc.html', 'agency_partnership_mobile_tc.pdf');
    }
    const previewOptions = {
      width: 1280,
      height: 720,
      pdfWidth: 1600,
      pdfHeight: 1200,
      cropToSlide: true,
      deviceScaleFactor: 2,
      pdfLayoutFixes: true,
    };
    if (!fourByThreeTcOnly) {
      await generatePDF('agency_partnership_4x3.html', 'agency_partnership_4x3_en.pdf', previewOptions);
    }
    await generatePDF('agency_partnership_4x3_tc.html', 'agency_partnership_4x3_tc.pdf', previewOptions);
    console.log('All PDFs generated successfully.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
