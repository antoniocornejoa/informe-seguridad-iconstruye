const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const ICONSTRUYE_URL = 'https://cl.iconstruye.com';
const LOGIN_URL = `${ICONSTRUYE_URL}/loginsso.aspx`;
const CONTROL_RECEPCION_URL = `${ICONSTRUYE_URL}/Recepcion/ControlRecepcion.aspx`;
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
    // Still on login page - take screenshot for debugging
    await page.screenshot({ path: path.join(__dirname, 'data', 'login_failed.png') });
    throw new Error('Login fallÃ³ - aÃºn en pÃ¡gina de login');
  }

  console.log('SesiÃ³n iniciada correctamente');
}

async function navigateToControlRecepcion(page) {
  console.log('Navegando a Control de Recepciones...');
  await page.goto(CONTROL_RECEPCION_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Log current URL and frames for debugging
  console.log('URL actual:', page.url());
  const frames = page.frames();
  console.log(`Frames encontrados: ${frames.length}`);
  for (let i = 0; i < frames.length; i++) {
    try {
      console.log(`  Frame ${i}: ${frames[i].url()}`);
    } catch (e) {}
  }

  let targetFrame = page;

  // Try to find the frame containing the search form or table
  for (const frame of frames) {
    try {
      // Check for common elements in iConstruye Control de Recepcion
      const hasRutField = await frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]').count();
      const hasBtn = await frame.locator('#btnBuscar, [name="btnBuscar"], input[value="Buscar"]').count();
      const hasTable = await frame.locator('#tblDetalle').count();

      if (hasRutField > 0 || hasBtn > 0 || hasTable > 0) {
        console.log(`  -> Frame seleccionado: ${frame.url()} (Rut: ${hasRutField}, Btn: ${hasBtn}, Tabla: ${hasTable})`);
        targetFrame = frame;
        break;
      }
    } catch (e) { /* skip inaccessible frames */ }
  }

  // If still on main page, wait more and try again
  if (targetFrame === page && frames.length > 1) {
    console.log('Frame no encontrado, esperando mÃ¡s...');
    await page.waitForTimeout(5000);

    const frames2 = page.frames();
    for (const frame of frames2) {
      try {
        const hasRutField = await frame.locator('input[id*="Rut"], input[id*="rut"]').count();
        const hasAnyInput = await frame.locator('input[type="text"]').count();
        console.log(`  Frame retry: ${frame.url()} (Rut: ${hasRutField}, inputs: ${hasAnyInput})`);
        if (hasRutField > 0) {
          targetFrame = frame;
          break;
        }
      } catch (e) {}
    }
  }

  if (targetFrame === page) {
    console.log('ADVERTENCIA: No se encontrÃ³ frame con formulario, usando pÃ¡gina principal');
    // Take debug screenshot
    await page.screenshot({ path: path.join(__dirname, 'data', 'debug_frames.png') });
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
    // Look for pagination links - iConstruye uses IrA(n) pattern
    const links = document.querySelectorAll('a[href*="IrA"]');
    let maxPage = 1;
    links.forEach(link => {
      const match = link.href.match(/IrA.*?(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPage) maxPage = num;
      }
    });
    // Also check onclick attributes
    const onclickLinks = document.querySelectorAll('a[onclick*="IrA"]');
    onclickLinks.forEach(link => {
      const match = link.getAttribute('onclick').match(/IrA\((\d+)\)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxPage) maxPage = num;
      }
    });
    // Also check for __doPostBack with IrA
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
  // Wait for table to be present
  try {
    await frame.waitForSelector('#tblDetalle', { timeout: 15000 });
  } catch (e) {
    console.log(`Esperando tabla en pÃ¡gina ${pageNum}...`);
    await frame.waitForTimeout(5000);
  }
}

async function searchByRut(frame, rut) {
  console.log(`Buscando RUT: ${rut}...`);

  // Clear and fill RUT field - wait for it to be visible first
  const rutField = frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]').first();
  await rutField.waitFor({ state: 'visible', timeout: 30000 });
  await rutField.fill('');
  await rutField.fill(rut);
  await frame.waitForTimeout(500);

  // Click search button via postback
  await frame.evaluate(() => {
    __doPostBack('btnBuscar', '');
  });

  // Wait for results
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

  // Get page count
  const totalPages = await getPageCount(frame);
  console.log(`  Total de pÃ¡ginas: ${totalPages}`);

  // Navigate to page 1 first if needed
  if (totalPages > 1) {
    await navigateToPage(frame, 1);
  }

  // Extract data from each page
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
