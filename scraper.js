const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const ICONSTRUYE_URL = 'https://cl.iconstruye.com';
const LOGIN_URL = `${ICONSTRUYE_URL}/loginsso.aspx`;
const USERNAME = process.env.ICONSTRUYE_USER;
const PASSWORD = process.env.ICONSTRUYE_PASS;

const RUTS = [
  { rut: '76230752-9', name: 'VSM ASOCIADOS SPA' },
  { rut: '77543490-2', name: 'Sociedad Guardias de Talca Ltda.' }
];

const COLUMNS = [
  'DocTransporte', 'TipoDoc', 'CentroGestionOC', 'CentroGestionRecibe',
  'FechaEmision', 'FechaIngreso', 'NNotaRecepcion', 'Usuario',
  'MontoRecibido', 'Proveedor', 'RUT', 'EstadoDocumento'
];

async function login(page) {
  console.log('Iniciando sesiÃ³n en iConstruye...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Click on "Ingresa con tu correo" tab to ensure it's active
  const correoTab = page.locator('a[href="#TabLoginSso"]');
  if (await correoTab.count() > 0) {
    await correoTab.click();
    await page.waitForTimeout(1000);
  }

  // Fill email field
  const emailField = page.locator('#txtUsuarioSso');
  await emailField.waitFor({ state: 'visible', timeout: 15000 });
  await emailField.fill(USERNAME);
  console.log('Email ingresado');

  // Fill password field
  const passField = page.locator('#txtPasswordSso');
  await passField.waitFor({ state: 'visible', timeout: 10000 });
  await passField.fill(PASSWORD);
  console.log('ContraseÃ±a ingresada');

  // Click login button
  const loginBtn = page.locator('#btnIniciaSessionSso');
  await loginBtn.click();
  console.log('BotÃ³n de login clickeado');

  // Wait for navigation after login
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // Verify login was successful by checking URL
  const currentUrl = page.url();
  console.log('URL despuÃ©s de login:', currentUrl);
  if (currentUrl.includes('loginsso')) {
    await page.screenshot({ path: path.join(__dirname, 'data', 'login_failed.png') });
    throw new Error('Login fallÃ³ - aÃºn en pÃ¡gina de login');
  }

  console.log('SesiÃ³n iniciada correctamente');
}

async function exploreFrames(page, label) {
  const frames = page.frames();
  console.log(`${label} - Frames encontrados: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    try {
      const url = frames[i].url();
      console.log(`  Frame ${i}: ${url}`);
    } catch (e) {
      console.log(`  Frame ${i}: [inaccesible]`);
    }
  }
  return frames;
}

async function navigateToControlRecepcion(page) {
  console.log('=== Explorando pÃ¡gina principal despuÃ©s de login ===');

  // First, explore the main page structure
  const mainUrl = page.url();
  console.log('URL principal:', mainUrl);

  let frames = await exploreFrames(page, 'PÃ¡gina principal');

  // Take a screenshot of the main page
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, 'data', 'debug_main_page.png') });

  // iConstruye uses a frameset - the main content is usually in a frame called "mainFrame" or similar
  // Try to find menu frame and content frame
  let menuFrame = null;
  let contentFrame = null;

  for (const frame of frames) {
    try {
      const url = frame.url();
      if (url.includes('menu') || url.includes('Menu') || url.includes('nav') || url.includes('Nav')) {
        menuFrame = frame;
        console.log(`  -> Menu frame encontrado: ${url}`);
      }
      if (url.includes('content') || url.includes('Content') || url.includes('main') || url.includes('Main')) {
        contentFrame = frame;
        console.log(`  -> Content frame encontrado: ${url}`);
      }
    } catch (e) {}
  }

  // Log all links in each frame to find navigation
  for (const frame of frames) {
    try {
      const url = frame.url();
      if (url === 'about:blank' || url === '') continue;

      const links = await frame.evaluate(() => {
        const allLinks = document.querySelectorAll('a');
        const linkData = [];
        allLinks.forEach(a => {
          const href = a.href || '';
          const text = a.innerText?.trim() || '';
          const onclick = a.getAttribute('onclick') || '';
          if ((href.toLowerCase().includes('recepcion') ||
               text.toLowerCase().includes('recepcion') || text.toLowerCase().includes('recepciÃ³n') ||
               onclick.toLowerCase().includes('recepcion')) && text.length < 100) {
            linkData.push({ text, href: href.substring(0, 200), onclick: onclick.substring(0, 200) });
          }
        });
        return linkData;
      });

      if (links.length > 0) {
        console.log(`  Links "recepcion" en frame ${url}:`);
        links.forEach(l => console.log(`    - "${l.text}" -> ${l.href} [onclick: ${l.onclick}]`));
      }
    } catch (e) {}
  }

  // Strategy 1: Try to find and click menu items in any frame
  console.log('\n=== Estrategia 1: Buscar menÃº de RecepciÃ³n ===');

  for (const frame of frames) {
    try {
      // Look for "RecepciÃ³n" or "Control" menu links
      const recepcionLinks = frame.locator('a:has-text("Recepci"), a:has-text("Control de Recep"), a:has-text("Control Recep")');
      const count = await recepcionLinks.count();

      if (count > 0) {
        console.log(`  Encontrados ${count} links de recepciÃ³n en frame ${frame.url()}`);
        for (let i = 0; i < count; i++) {
          const text = await recepcionLinks.nth(i).innerText();
          console.log(`    Link ${i}: "${text.trim()}"`);
        }

        // Try to click "Control de RecepciÃ³n" first, then "RecepciÃ³n"
        const controlLink = frame.locator('a:has-text("Control de Recep"), a:has-text("Control Recep")').first();
        if (await controlLink.count() > 0) {
          console.log('  Clickeando "Control de RecepciÃ³n"...');
          await controlLink.click();
          await page.waitForTimeout(5000);

          // Check if we got to the right page
          frames = await exploreFrames(page, 'DespuÃ©s de click Control RecepciÃ³n');
          break;
        }

        // Otherwise click "RecepciÃ³n" main menu
        const recepLink = frame.locator('a:has-text("Recepci")').first();
        if (await recepLink.count() > 0) {
          console.log('  Clickeando "RecepciÃ³n" menÃº...');
          await recepLink.click();
          await page.waitForTimeout(3000);

          // Now look for sub-menu "Control de RecepciÃ³n"
          frames = await exploreFrames(page, 'DespuÃ©s de click RecepciÃ³n');

          for (const f of page.frames()) {
            const subLink = f.locator('a:has-text("Control de Recep"), a:has-text("Control Recep")');
            if (await subLink.count() > 0) {
              console.log('  Clickeando sub-menÃº "Control de RecepciÃ³n"...');
              await subLink.first().click();
              await page.waitForTimeout(5000);
              frames = await exploreFrames(page, 'DespuÃ©s de click sub-menÃº');
              break;
            }
          }
          break;
        }
      }
    } catch (e) {
      console.log(`  Error en frame: ${e.message}`);
    }
  }

  // Strategy 2: If direct URL failed before, try navigating within a frame
  console.log('\n=== Estrategia 2: Buscar frame con formulario ===');

  frames = page.frames();
  let targetFrame = page;

  for (const frame of frames) {
    try {
      const hasRutField = await frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]').count();
      const hasBtn = await frame.locator('#btnBuscar, [name="btnBuscar"], input[value="Buscar"]').count();
      const hasTable = await frame.locator('#tblDetalle').count();

      if (hasRutField > 0 || hasBtn > 0 || hasTable > 0) {
        console.log(`  -> Frame con formulario: ${frame.url()} (Rut: ${hasRutField}, Btn: ${hasBtn}, Tabla: ${hasTable})`);
        targetFrame = frame;
        break;
      }
    } catch (e) {}
  }

  // Strategy 3: Try navigating to different URL patterns for Control Recepcion
  if (targetFrame === page) {
    console.log('\n=== Estrategia 3: Probar URLs alternativas ===');

    const alternativeUrls = [
      `${ICONSTRUYE_URL}/Recepcion/ControlRecepcion.aspx`,
      `${ICONSTRUYE_URL}/recepcion/controlrecepcion.aspx`,
      `${ICONSTRUYE_URL}/Recepcion/ControlRecepcion`,
      `${ICONSTRUYE_URL}/Modules/Recepcion/ControlRecepcion.aspx`,
      `${ICONSTRUYE_URL}/modules/recepcion/controlrecepcion.aspx`,
      `${ICONSTRUYE_URL}/App/Recepcion/ControlRecepcion.aspx`,
    ];

    // First, let's explore all frame URLs and log all links to help debug
    for (const frame of page.frames()) {
      try {
        const allLinks = await frame.evaluate(() => {
          const links = document.querySelectorAll('a');
          const result = [];
          links.forEach(a => {
            const href = a.href || '';
            const text = a.innerText?.trim() || '';
            if (text.length > 0 && text.length < 80) {
              result.push({ text, href: href.substring(0, 250) });
            }
          });
          return result.slice(0, 50); // Limit to first 50
        });

        if (allLinks.length > 0) {
          console.log(`\n  Todos los links en frame ${frame.url().substring(0, 100)}:`);
          allLinks.forEach(l => console.log(`    "${l.text}" -> ${l.href}`));
        }
      } catch (e) {}
    }

    // Try alternative URLs
    for (const url of alternativeUrls) {
      try {
        console.log(`  Probando: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(3000);

        const currentUrl = page.url();
        console.log(`  Resultado: ${currentUrl}`);

        if (!currentUrl.includes('error.aspx') && !currentUrl.includes('Error')) {
          console.log('  URL alternativa funcionÃ³!');
          frames = await exploreFrames(page, 'URL alternativa');

          // Look for form in all frames
          for (const frame of page.frames()) {
            try {
              const hasRutField = await frame.locator('input[id*="Rut"], input[id*="rut"]').count();
              if (hasRutField > 0) {
                targetFrame = frame;
                console.log(`  Frame con campo RUT encontrado: ${frame.url()}`);
                break;
              }
            } catch (e) {}
          }
          if (targetFrame !== page) break;
        }
      } catch (e) {
        console.log(`  Error: ${e.message}`);
      }
    }
  }

  if (targetFrame === page) {
    console.log('\nADVERTENCIA: No se encontrÃ³ frame con formulario de Control de RecepciÃ³n');
    await page.screenshot({ path: path.join(__dirname, 'data', 'debug_no_form.png'), fullPage: true });

    // Log page HTML structure for debugging
    const html = await page.content();
    fs.writeFileSync(path.join(__dirname, 'data', 'debug_page.html'), html);
    console.log('HTML de la pÃ¡gina guardado en debug_page.html');
  }

  return targetFrame;
}

async function setFilters(frame) {
  console.log('Configurando filtros...');

  // Set Centro de GestiÃ³n OC to "Todos"
  try {
    const selectOC = frame.locator('select[id*="CentroGestion"], select[name*="ddlCentroGestion"]').first();
    if (await selectOC.count() > 0) {
      await selectOC.selectOption({ index: 0 }); // "Todos" is usually first
    }
  } catch (e) {
    console.log('No se pudo configurar Centro de GestiÃ³n OC:', e.message);
  }

  // Set Fecha inicio to 01-01-2025
  try {
    const fechaInput = frame.locator('input[id*="fecha"], input[id*="Fecha"], input[name*="fecha"], input[name*="Fecha"]').first();
    if (await fechaInput.count() > 0) {
      await fechaInput.fill('');
      await fechaInput.fill('01-01-2025');
    }
  } catch (e) {
    console.log('No se pudo configurar fecha:', e.message);
  }

  await frame.waitForTimeout(1000);
}

async function extractTableData(frame) {
  return await frame.evaluate(() => {
    const table = document.getElementById('tblDetalle');
    if (!table) return [];
    const rows = table.querySelectorAll('tr');
    const data = [];
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      const row = [];
      cells.forEach(c => row.push(c.innerText.trim()));
      if (row.length >= 12) data.push(row.slice(0, 12));
    }
    return data;
  });
}

async function getPageCount(frame) {
  return await frame.evaluate(() => {
    const links = document.querySelectorAll('a[href*="IrA"]');
    let maxPage = 1;
    links.forEach(link => {
      const match = link.href.match(/IrA.*?(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPage) maxPage = num;
      }
    });
    const onclickLinks = document.querySelectorAll('a[onclick*="IrA"]');
    onclickLinks.forEach(link => {
      const match = link.getAttribute('onclick').match(/IrA\((\d+)\)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPage) maxPage = num;
      }
    });
    const allLinks = document.querySelectorAll('a[href*="__doPostBack"]');
    allLinks.forEach(link => {
      const match = link.href.match(/IrA.*?(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPage) maxPage = num;
      }
    });
    return maxPage;
  });
}

async function navigateToPage(frame, pageNum) {
  await frame.evaluate((num) => {
    __doPostBack('IrA', num.toString());
  }, pageNum);
  await frame.waitForTimeout(3000);
  try {
    await frame.waitForSelector('#tblDetalle', { timeout: 15000 });
  } catch (e) {
    console.log(`Esperando tabla en pÃ¡gina ${pageNum}...`);
    await frame.waitForTimeout(5000);
  }
}

async function searchByRut(frame, rut) {
  console.log(`Buscando RUT: ${rut}...`);

  const rutField = frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]').first();
  await rutField.waitFor({ state: 'visible', timeout: 30000 });
  await rutField.fill('');
  await rutField.fill(rut);
  await frame.waitForTimeout(500);

  await frame.evaluate(() => {
    __doPostBack('btnBuscar', '');
  });

  await frame.waitForTimeout(5000);
  try {
    await frame.waitForSelector('#tblDetalle', { timeout: 20000 });
  } catch (e) {
    console.log('Tabla no encontrada, esperando mÃ¡s...');
    await frame.waitForTimeout(10000);
  }
}

async function scrapeAllPages(frame, rutInfo) {
  await searchByRut(frame, rutInfo.rut);

  let allData = [];

  const totalPages = await getPageCount(frame);
  console.log(`  Total de pÃ¡ginas: ${totalPages}`);

  if (totalPages > 1) {
    await navigateToPage(frame, 1);
  }

  for (let p = 1; p <= totalPages; p++) {
    if (p > 1) {
      await navigateToPage(frame, p);
    }

    const pageData = await extractTableData(frame);
    console.log(`  PÃ¡gina ${p}: ${pageData.length} filas`);
    allData = allData.concat(pageData);
  }

  console.log(`  Total ${rutInfo.name}: ${allData.length} filas`);
  return allData;
}

async function main() {
  if (!USERNAME || !PASSWORD) {
    console.error('Error: Variables ICONSTRUYE_USER e ICONSTRUYE_PASS requeridas');
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'es-CL'
  });

  const page = await context.newPage();

  try {
    await login(page);
    const frame = await navigateToControlRecepcion(page);

    // Check if we actually found the form
    let hasForm = false;
    try {
      const rutField = frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]');
      hasForm = (await rutField.count()) > 0;
    } catch (e) {}

    if (!hasForm) {
      console.error('ERROR: No se pudo acceder al formulario de Control de RecepciÃ³n');
      console.error('Revise los logs de debug para mÃ¡s informaciÃ³n');
      await page.screenshot({ path: path.join(__dirname, 'data', 'error_screenshot.png') });
      process.exit(1);
    }

    await setFilters(frame);

    const allResults = {};

    for (const rutInfo of RUTS) {
      const data = await scrapeAllPages(frame, rutInfo);
      allResults[rutInfo.rut] = {
        name: rutInfo.name,
        rows: data
      };
    }

    // Save raw data
    const outputPath = path.join(__dirname, 'data', 'raw_data.json');
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\nDatos guardados en: ${outputPath}`);
    console.log(`Total de registros: ${Object.values(allResults).reduce((acc, r) => acc + r.rows.length, 0)}`);

  } catch (error) {
    console.error('Error durante el scraping:', error);
    // Take screenshot on error
    await page.screenshot({ path: path.join(__dirname, 'data', 'error_screenshot.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
