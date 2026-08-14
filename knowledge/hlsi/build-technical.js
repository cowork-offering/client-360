/**
 * Build the Customer 360 Stage 0 functional HLSI.
 * Inlines embedded IBM Plex woff2 fonts and the base64 Accenture logo into the
 * source HTML (zero external loads), writes the self-contained HTML, then renders
 * it to A4 PDF with printBackground. Uses the non-snap Chrome bundled with the
 * global puppeteer install. NEVER snap chromium.
 *
 * This is a functional companion to the architecture HLSI: no founder/team
 * section, so only FONTS + LOGO are substituted. Fonts and logo are shared from
 * the commercial-credit-hlsi asset set (same house style).
 */
const puppeteer = require('/home/fabian/.bun/install/global/node_modules/puppeteer');
const fs = require('fs');

const DIR = '/opt/connectry/brain/knowledge/projects/company-brain/customer-360-mcp/hlsi';
const ASSETS = '/opt/connectry/brain/knowledge/projects/company-brain/commercial-credit-hlsi';
const SRC = DIR + '/technical-hlsi.src.html';
const FONTS = ASSETS + '/fonts/embedded-fonts.css';
const LOGO = ASSETS + '/assets/accenture-logo.png';
const OUT_HTML = DIR + '/technical-hlsi.html';
const OUT_PDF = DIR + '/technical-hlsi.pdf';
const CHROME = '/home/fabian/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome';

async function main() {
  let html = fs.readFileSync(SRC, 'utf8');
  const fonts = fs.readFileSync(FONTS, 'utf8');
  const logo = fs.readFileSync(LOGO).toString('base64');

  html = html.replace('/*FONTS_PLACEHOLDER*/', fonts);
  html = html.split('/*LOGO_PLACEHOLDER*/').join(logo);
  fs.writeFileSync(OUT_HTML, html);
  console.log('Wrote HTML:', OUT_HTML, `(${(html.length / 1024).toFixed(0)} KB)`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + OUT_HTML, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));

  // Repeating running header + footer via Chrome's native print furniture.
  // This reserves space in the page margin on EVERY page (including
  // continuation pages mid-section), so it never collides with body
  // content. position:fixed cannot do this in Chrome (it clamps to the
  // content box and overlaps tall headings), so furniture lives here.
  const MONO = "ui-monospace,'IBM Plex Mono',SFMono-Regular,Menlo,Consolas,monospace";
  const FAINT = '#8a8a9a';
  const VIOLET = '#5b3fd4';
  const headerTemplate = `
    <div style="width:100%;font-family:${MONO};font-size:7pt;letter-spacing:.12em;
                text-transform:uppercase;color:${FAINT};
                padding:0 14mm;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  border-bottom:0.5px solid #e8e6ee;padding-bottom:2mm;">
        <span>Customer 360 <span style="color:${VIOLET};">&middot;</span> Functional HLSI</span>
        <img src="data:image/png;base64,${logo}" style="height:3.4mm;width:auto;">
      </div>
    </div>`;
  const footerTemplate = `
    <div style="width:100%;font-family:${MONO};font-size:6.6pt;letter-spacing:.08em;
                text-transform:uppercase;color:${FAINT};
                padding:0 14mm;box-sizing:border-box;">
      <div style="display:flex;justify-content:space-between;align-items:center;
                  border-top:0.5px solid #e8e6ee;padding-top:2mm;">
        <span>Accenture</span>
        <span style="color:#6b6772;">Commercial Credit Brain &middot; Stage 0</span>
        <span>Customer 360 &middot; Solution Intent</span>
      </div>
    </div>`;

  await page.pdf({
    path: OUT_PDF,
    width: '297mm',
    height: '210mm',
    printBackground: true,
    preferCSSPageSize: false,
    displayHeaderFooter: false,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();

  const bytes = fs.statSync(OUT_PDF).size;
  console.log('Wrote PDF:', OUT_PDF, `(${(bytes / 1024).toFixed(0)} KB)`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
