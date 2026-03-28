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
  'FechaEmision', 'FechaIngreso', 'NNotaRecepcion', 'Usuario',
  'MontoRecibido', 'Proveedor', 'RUT', 'EstadoDocumento'
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
  console.log('URL:', CONTROL_RECEPCION_URL);
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
  for (let i = 0; i < frames.length; i++) {
    try { console.log(`  Frame ${i}: ${frames[i].url()}`); } catch (e) {}
  }

  let targetFrame = page;

  for (const frame of frames) {
    try {
      const hasRutField = await frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]').count();
      const hasBtn = await frame.locator('#btnBuscar, [name="btnBuscar"], input[value="Buscar"]').count();
      const hasTable = await frame.locator('#tblDetalle, table[id*="detalle"], table[id*="Detalle"]').count();
      const hasAnyInput = await frame.locator('input[type="text"]').count();

      console.log(`  Frame check ${frame.url().substring(0, 80)}: Rut=${hasRutField}, Btn=${hasBtn}, Table=${hasTable}, Inputs=${hasAnyInput}`);

      if (hasRutField > 0 || hasBtn > 0 || hasTable > 0) {
        console.log(`  -> Frame seleccionado!`);
        targetFrame = frame;
        break;
      }
    } catch (e) {}
  }

  return targetFrame;
}

async function debugFormElements(frame, page) {
  console.log('\n=== DEBUG: Elementos del formulario ===');

  // Get ALL form elements with their details
  const elements = await frame.evaluate(() => {
    const result = [];
    // Inputs
    document.querySelectorAll('input').forEach(el => {
      result.push({
        tag: 'input',
        type: el.type || '',
        id: el.id || '',
        name: el.name || '',
        value: el.value || '',
        placeholder: el.placeholder || '',
        visible: el.offsetParent !== null
      });
    });
    // Selects
    document.querySelectorAll('select').forEach(el => {
      const options = [];
      el.querySelectorAll('option').forEach(opt => {
        options.push({ value: opt.value, text: opt.text, selected: opt.selected });
      });
      result.push({
        tag: 'select',
        id: el.id || '',
        name: el.name || '',
        selectedValue: el.value,
        options: options.slice(0, 10),
        visible: el.offsetParent !== null
      });
    });
    // Tables
    document.querySelectorAll('table').forEach(el => {
      const rows = el.querySelectorAll('tr');
      result.push({
        tag: 'table',
        id: el.id || '',
        className: el.className || '',
        rows: rows.length,
        visible: el.offsetParent !== null
      });
    });
    return result;
  });

  elements.forEach(el => {
    if (el.tag === 'input') {
      console.log(`  <input type="${el.type}" id="${el.id}" name="${el.name}" value="${el.value}" placeholder="${el.placeholder}" visible=${el.visible}>`);
    } else if (el.tag === 'select') {
      console.log(`  <select id="${el.id}" name="${el.name}" selected="${el.selectedValue}" visible=${el.visible}>`);
      el.options.forEach(opt => {
        console.log(`    <option value="${opt.value}" ${opt.selected ? 'SELECTED' : ''}>${opt.text}</option>`);
      });
    } else if (el.tag === 'table') {
      console.log(`  <table id="${el.id}" class="${el.className}" rows=${el.rows} visible=${el.visible}>`);
    }
  });

  // Take screenshot of form
  await page.screenshot({ path: path.join(__dirname, 'data', 'debug_form.png'), fullPage: true });
  console.log('=== FIN DEBUG ===\n');

  return elements;
}

async function setFilters(frame, page) {
  console.log('Configurando filtros...');

  // Debug: log all form elements first
  const elements = await debugFormElements(frame, page);

  // Set Centro de GestiÃ³n OC to "Todos"
  try {
    const selectOC = frame.locator('select[id*="CentroGestion"], select[name*="ddlCentroGestion"]').first();
    if (await selectOC.count() > 0) {
      await selectOC.selectOption({ index: 0 });
      console.log('  Centro de GestiÃ³n configurado');
    } else {
      console.log('  Centro de GestiÃ³n select NO encontrado');
    }
  } catch (e) {
    console.log('  Error configurando Centro de GestiÃ³n:', e.message);
  }

  // Try multiple strategies for date fields
  console.log('Buscando campos de fecha...');

  // Strategy 1: Look for any input with date-like ids
  const dateSelectors = [
    'input[id*="fecha"]', 'input[id*="Fecha"]',
    'input[id*="date"]', 'input[id*="Date"]',
    'input[id*="fDesde"]', 'input[id*="fHasta"]',
    'input[id*="desde"]', 'input[id*="hasta"]',
    'input[id*="Desde"]', 'input[id*="Hasta"]',
    'input[id*="Inicio"]', 'input[id*="Fin"]',
    'input[id*="inicio"]', 'input[id*="fin"]',
    'input[name*="fecha"]', 'input[name*="Fecha"]',
    'input[name*="date"]', 'input[name*="Date"]',
    'input[name*="Desde"]', 'input[name*="Hasta"]'
  ];

  for (const sel of dateSelectors) {
    const count = await frame.locator(sel).count();
    if (count > 0) {
      console.log(`  Encontrado campo fecha con selector "${sel}" (${count} elementos)`);
      try {
        const field = frame.locator(sel).first();
        const fieldId = await field.getAttribute('id');
        const fieldName = await field.getAttribute('name');
        const fieldValue = await field.inputValue();
        console.log(`    id="${fieldId}" name="${fieldName}" valor actual="${fieldValue}"`);
        // Try to set it
        await field.fill('');
        await field.fill('01-01-2025');
        const newValue = await field.inputValue();
        console.log(`    Nuevo valor="${newValue}"`);
      } catch (e) {
        console.log(`    Error al llenar: ${e.message}`);
      }
    }
  }

  // Strategy 2: Check for text inputs that currently contain date-like values
  const textInputs = await frame.locator('input[type="text"]').all();
  console.log(`\n  Revisando ${textInputs.length} inputs de texto por valores de fecha...`);
  for (let i = 0; i < textInputs.length; i++) {
    try {
      const id = await textInputs[i].getAttribute('id') || '';
      const name = await textInputs[i].getAttribute('name') || '';
      const value = await textInputs[i].inputValue();
      if (value && (value.match(/\d{2}[-\/]\d{2}[-\/]\d{4}/) || value.match(/\d{4}[-\/]\d{2}[-\/]\d{2}/))) {
        console.log(`    FECHA encontrada! input[${i}] id="${id}" name="${name}" value="${value}"`);
      } else if (id || name) {
        console.log(`    input[${i}] id="${id}" name="${name}" value="${value}"`);
      }
    } catch (e) {}
  }

  // Take screenshot after filters
  await page.screenshot({ path: path.join(__dirname, 'data', 'debug_after_filters.png'), fullPage: true });

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

  try {
    const btnBuscar = frame.locator('#btnBuscar, [name="btnBuscar"], input[value="Buscar"], button:has-text("Buscar")').first();
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

  // Debug: log table HTML structure
  const tableInfo = await frame.evaluate(() => {
    const table = document.getElementById('tblDetalle');
    if (!table) return { found: false };
    const rows = table.querySelectorAll('tr');
    const headerCells = rows[0] ? Array.from(rows[0].querySelectorAll('th, td')).map(c => c.innerText.trim()) : [];
    const firstRowCells = rows[1] ? Array.from(rows[1].querySelectorAll('td')).map(c => c.innerText.trim()) : [];
    return {
      found: true,
      totalRows: rows.length,
      headers: headerCells,
      firstRow: firstRowCells,
      outerHTML: table.outerHTML.substring(0, 2000)
    };
  });

  console.log(`  Tabla info: ${JSON.stringify({
    found: tableInfo.found,
    rows: tableInfo.totalRows,
    headers: tableInfo.headers,
    firstRow: tableInfo.firstRow
  }, null, 0)}`);

  if (tableInfo.totalRows <= 1) {
    // Also log any message on the page that says "no results"
    const noResults = await frame.evaluate(() => {
      const body = document.body.innerText;
      const lines = body.split('\n').filter(l => l.trim());
      return lines.filter(l =>
        l.toLowerCase().includes('no hay') ||
        l.toLowerCase().includes('sin resultado') ||
        l.toLowerCase().includes('no se encontr') ||
        l.toLowerCase().includes('0 registro')
      );
    });
    if (noResults.length > 0) {
      console.log(`  Mensajes de sin resultados: ${JSON.stringify(noResults)}`);
    }
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
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

  try {
    await login(page);
    const frame = await navigateToControlRecepcion(page);

    let hasForm = false;
    try {
      const rutField = frame.locator('input[id*="RutProveedor"], input[id*="txtRut"], input[name*="Rut"]');
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
      const data = await scrapeAllPages(frame, rutInfo);
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
