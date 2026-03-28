const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Configuration
const ICONSTRUYE_URL = 'https://cl.iconstruye.com';
const LOGIN_URL = `${ICONSTRUYE_URL}/loginsso.aspx`;
const CONTROL_RECEPCION_URL = `${ICONSTRUYE_URL}/bodega/reportes/control_recepciones_nr.aspx`;
const USERNAME = process.env.ICONSTRUYE_USER;
const PASSWORD = process.env.ICONSTRUYE_PASS;

const RUTS = [
  { rut: '76230752-9', name: 'VSM ASOCIADOS SPA' },
  { rut: '77543490-2', name: 'Sociedad Guardias de Talca Ltda.' }
];

const COLUMNS = [
  'DocTransporte', 'TipoDoc', 'CentroGestionOC', 'CentroGestionRecibe',
  'FechaEmisionDoc', 'FechaIngreso', 'NNotaRecepcion', 'Usuario',
  'MontoRecibido', 'Proveedor', 'RUT', 'EstadoDocumento',
  'EstadoAsociacion', 'Opciones', 'Impresion'
];

async function login(page) {
  console.log('Iniciando sesiÃ³n en iConstruye...');
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const correoTab = page.locator('a[href="#TabLoginSso"]');
  if (await correoTab.count() > 0) {
    await correoTab.click();
    await page.waitForTimeout(1000);
  }

  const emailField = page.locator('#txtUsuarioSso');
  await emailField.waitFor({ state: 'visible', timeout: 15000 });
  await emailField.fill(USERNAME);
  console.log('Email ingresado');

  const passField = page.locator('#txtPasswordSso');
  await passField.waitFor({ state: 'visible', timeout: 10000 });
  await passField.fill(PASSWORD);
  console.log('ContraseÃ±a ingresada');

  const loginBtn = page.locator('#btnIniciaSessionSso');
  await loginBtn.click();
  console.log('BotÃ³n de login clickeado');

  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  console.log('URL despuÃ©s de login:', currentUrl);
  if (currentUrl.includes('loginsso')) {
    await page.screenshot({ path: path.join(__dirname, 'data', 'login_failed.png') });
    throw new Error('Login fallÃ³ - aÃºn en pÃ¡gina de login');
  }
  console.log('SesiÃ³n iniciada correctamente');
}

async function navigateToControlRecepcion(page) {
  console.log('Navegando a Control de Recepciones...');
  await page.goto(CONTROL_RECEPCION_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);

  const currentUrl = page.url();
  console.log('URL actual:', currentUrl);

  if (currentUrl.includes('error.aspx')) {
    await page.screenshot({ path: path.join(__dirname, 'data', 'debug_error_page.png') });
    throw new Error(`PÃ¡gina de error: ${currentUrl}`);
  }

  const frames = page.frames();
  console.log(`Frames encontrados: ${frames.length}`);

  let targetFrame = page;

  for (const frame of frames) {
    try {
      const hasRutField = await frame.locator('#txtRutProveedor').count();
      const hasBtn = await frame.locator('#btnBuscar').count();
      const hasTable = await frame.locator('#tblDetalle').count();

      if (hasRutField > 0 || hasBtn > 0 || hasTable > 0) {
        console.log('Frame con formulario encontrado');
        targetFrame = frame;
        break;
      }
    } catch (e) {}
  }

  return targetFrame;
}

async function setFilters(frame, page) {
  console.log('Configurando filtros...');

  // Set date range: from 01-01-2025 to today
  // Real field IDs: ctrRangoIngresoFECHADESDE, ctrRangoIngresoFECHAHASTA
  try {
    const fechaDesde = frame.locator('#ctrRangoIngresoFECHADESDE');
    if (await fechaDesde.count() > 0) {
      const currentValue = await fechaDesde.inputValue();
      console.log(`  Fecha Desde actual: ${currentValue}`);
      await fechaDesde.fill('');
      await fechaDesde.fill('01-01-2025');
      const newValue = await fechaDesde.inputValue();
      console.log(`  Fecha Desde nueva: ${newValue}`);
    } else {
      console.log('  Campo ctrRangoIngresoFECHADESDE no encontrado');
    }
  } catch (e) {
    console.log('  Error configurando fecha desde:', e.message);
  }

  try {
    const fechaHasta = frame.locator('#ctrRangoIngresoFECHAHASTA');
    if (await fechaHasta.count() > 0) {
      const currentValue = await fechaHasta.inputValue();
      console.log(`  Fecha Hasta actual: ${currentValue}`);
      // Keep default (today's date) - no need to change
    }
  } catch (e) {
    console.log('  Error leyendo fecha hasta:', e.message);
  }

  // Set Centro de GestiÃ³n Recibe to first option (all)
  try {
    const selectCG = frame.locator('#lstCentroGestionRecibe');
    if (await selectCG.count() > 0) {
      // Don't change - keep default selection
      const val = await selectCG.inputValue();
      console.log(`  Centro GestiÃ³n Recibe: ${val}`);
    }
  } catch (e) {
    console.log('  Error leyendo Centro GestiÃ³n:', e.message);
  }

  // Set Estado Ingreso to "Todos" (-1)
  try {
    const selectEstado = frame.locator('#lstEstadoIngreso');
    if (await selectEstado.count() > 0) {
      await selectEstado.selectOption('-1');
      console.log('  Estado Ingreso: Todos');
    }
  } catch (e) {
    console.log('  Error configurando Estado Ingreso:', e.message);
  }

  // Set Tipo Nota to "Todos" (-1)
  try {
    const selectTipo = frame.locator('#lstTipoNota');
    if (await selectTipo.count() > 0) {
      await selectTipo.selectOption('-1');
      console.log('  Tipo Nota: Todos');
    }
  } catch (e) {
    console.log('  Error configurando Tipo Nota:', e.message);
  }

  // Take screenshot of configured form
  await page.screenshot({ path: path.join(__dirname, 'data', 'debug_form.png'), fullPage: true });

  await frame.waitForTimeout(1000);
}

async function extractTableData(frame) {
  return await frame.evaluate(() => {
    const table = document.getElementById('tblDetalle');
    if (!table) return [];

    const rows = table.querySelectorAll('tr');
    const data = [];

    // Skip header row (i=0), extract data rows
    for (let i = 1; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      const row = [];
      cells.forEach(c => row.push(c.innerText.trim()));
      // Table has 15 columns, we want first 12 (skip Opciones, Impresion, etc)
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

async function searchByRut(frame, rut, page) {
  console.log(`Buscando RUT: ${rut}...`);

  const rutField = frame.locator('#txtRutProveedor');
  await rutField.waitFor({ state: 'visible', timeout: 30000 });
  await rutField.fill('');
  await rutField.fill(rut);
  await frame.waitForTimeout(500);

  try {
    const btnBuscar = frame.locator('#btnBuscar');
    if (await btnBuscar.count() > 0) {
      await btnBuscar.click();
      console.log('  BotÃ³n Buscar clickeado');
    } else {
      await frame.evaluate(() => { __doPostBack('btnBuscar', ''); });
      console.log('  PostBack btnBuscar ejecutado');
    }
  } catch (e) {
    await frame.evaluate(() => { __doPostBack('btnBuscar', ''); });
    console.log('  PostBack btnBuscar ejecutado (fallback)');
  }

  await frame.waitForTimeout(5000);

  try {
    await frame.waitForSelector('#tblDetalle', { timeout: 20000 });
    console.log('  Tabla encontrada');
  } catch (e) {
    console.log('  Tabla no encontrada, esperando mÃ¡s...');
    await frame.waitForTimeout(10000);
  }

  // Log table info for debugging
  const tableInfo = await frame.evaluate(() => {
    const table = document.getElementById('tblDetalle');
    if (!table) return { found: false };
    const rows = table.querySelectorAll('tr');
    return {
      found: true,
      totalRows: rows.length,
      dataRows: rows.length - 1
    };
  });

  console.log(`  Tabla: ${tableInfo.dataRows} filas de datos`);

  // Take screenshot after search
  await page.screenshot({ path: path.join(__dirname, 'data', `debug_search_${rut.replace('-', '')}.png`), fullPage: true });
}

async function scrapeAllPages(frame, rutInfo, page) {
  await searchByRut(frame, rutInfo.rut, page);

  let allData = [];
  const totalPages = await getPageCount(frame);
  console.log(`  Total de pÃ¡ginas: ${totalPages}`);

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
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

  try {
    await login(page);
    const frame = await navigateToControlRecepcion(page);

    let hasForm = false;
    try {
      const rutField = frame.locator('#txtRutProveedor');
      hasForm = (await rutField.count()) > 0;
    } catch (e) {}

    if (!hasForm) {
      console.error('ERROR: No se pudo acceder al formulario de Control de RecepciÃ³n');
      await page.screenshot({ path: path.join(__dirname, 'data', 'error_screenshot.png') });
      process.exit(1);
    }

    console.log('Formulario de Control de RecepciÃ³n encontrado!');
    await setFilters(frame, page);

    const allResults = {};

    for (const rutInfo of RUTS) {
      const data = await scrapeAllPages(frame, rutInfo, page);
      allResults[rutInfo.rut] = {
        name: rutInfo.name,
        rows: data
      };
    }

    // Save raw data
    const outputPath = path.join(__dirname, 'data', 'raw_data.json');
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\nDatos guardados en: ${outputPath}`);
    console.log(`Total de registros: ${Object.values(allResults).reduce((acc, r) => acc + r.rows.length, 0)}`);

  } catch (error) {
    console.error('Error durante el scraping:', error);
    await page.screenshot({ path: path.join(__dirname, 'data', 'error_screenshot.png') });
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
