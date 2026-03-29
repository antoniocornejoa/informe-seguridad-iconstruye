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
  { rut: '76230752-9', rutSinDV: '76230752', name: 'VSM ASOCIADOS SPA' },
  { rut: '77543490-2', rutSinDV: '77543490', name: 'Sociedad Guardias de Talca Ltda.' }
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

// NEW: Select provider via the popup search (lupa icon)
// Flow: click lupa -> popup opens -> enter RUT -> search -> select "Proveedores No integrados" tab -> click select -> accept dialog
async function selectProvider(frame, page, rutInfo) {
  console.log(`Seleccionando proveedor: ${rutInfo.name} (${rutInfo.rut})...`);

  // Set up dialog handler BEFORE triggering it - accept the "no integrado" confirmation
  page.on('dialog', async (dialog) => {
    console.log(`  Dialog detectado: "${dialog.message().substring(0, 80)}..."`);
    await dialog.accept();
    console.log('  Dialog aceptado');
  });

  // Find and click the magnifying glass icon (lupa) next to RUT Proveedor
  // It could be an image button, a link, or a regular button near txtRutProveedor
  let lupaClicked = false;

  // Try common selectors for the lupa/search icon
  const lupaSelectors = [
    'img[src*="lupa"]',
    'img[src*="search"]',
    'img[src*="buscar"]',
    'a[href*="proveedores"]',
    'input[type="image"][src*="lupa"]',
    'input[type="image"][src*="search"]',
    '#imgBuscarProveedor',
    '#btnBuscarProveedor',
    '#lnkBuscarProveedor',
    'img[onclick*="proveedor"]',
    'a[onclick*="proveedor"]',
  ];

  for (const selector of lupaSelectors) {
    try {
      const el = frame.locator(selector);
      if (await el.count() > 0) {
        console.log(`  Lupa encontrada con selector: ${selector}`);

        // Listen for popup window
        const [popup] = await Promise.all([
          page.context().waitForEvent('page', { timeout: 10000 }),
          el.first().click()
        ]);

        console.log('  Popup de proveedores abierto');
        await popup.waitForLoadState('networkidle', { timeout: 30000 });
        await popup.waitForTimeout(2000);

        const popupUrl = popup.url();
        console.log(`  Popup URL: ${popupUrl}`);

        // Screenshot of the popup
        await popup.screenshot({ path: path.join(__dirname, 'data', `debug_popup_${rutInfo.rutSinDV}.png`) });

        // Enter the RUT (sin digito ni puntos) in the popup search field
        // The popup has a field for RUT - try common IDs
        const rutInputSelectors = ['#txtRut', '#txtRutBuscar', 'input[id*="Rut"]', 'input[id*="rut"]', 'input[type="text"]'];
        let rutEntered = false;

        for (const rutSel of rutInputSelectors) {
          try {
            const rutInput = popup.locator(rutSel).first();
            if (await rutInput.count() > 0 && await rutInput.isVisible()) {
              await rutInput.fill(rutInfo.rutSinDV);
              console.log(`  RUT ingresado en popup: ${rutInfo.rutSinDV} (selector: ${rutSel})`);
              rutEntered = true;
              break;
            }
          } catch (e) {}
        }

        if (!rutEntered) {
          console.log('  WARN: No se pudo ingresar RUT en popup, intentando con todos los inputs...');
          const inputs = popup.locator('input[type="text"]');
          const count = await inputs.count();
          if (count > 0) {
            await inputs.first().fill(rutInfo.rutSinDV);
            console.log(`  RUT ingresado en primer input de texto`);
          }
        }

        // Click "Buscar" button in popup
        const buscarPopupSelectors = ['#btnBuscar', 'input[value="Buscar"]', 'button:has-text("Buscar")', 'input[type="submit"]', 'input[type="button"][value*="Buscar"]'];
        for (const btnSel of buscarPopupSelectors) {
          try {
            const btn = popup.locator(btnSel).first();
            if (await btn.count() > 0) {
              await btn.click();
              console.log(`  Buscar clickeado en popup (selector: ${btnSel})`);
              break;
            }
          } catch (e) {}
        }

        await popup.waitForTimeout(3000);
        await popup.screenshot({ path: path.join(__dirname, 'data', `debug_popup_results_${rutInfo.rutSinDV}.png`) });

        // Click on "Proveedores No integrados" tab
        try {
          const noIntegradosTab = popup.locator('text=No integrados').first();
          if (await noIntegradosTab.count() > 0) {
            await noIntegradosTab.click();
            console.log('  Tab "Proveedores No integrados" clickeado');
            await popup.waitForTimeout(1000);
          } else {
            // Try alternative selectors
            const tabLinks = popup.locator('a, td, span, div').filter({ hasText: 'No integrados' });
            if (await tabLinks.count() > 0) {
              await tabLinks.first().click();
              console.log('  Tab "No integrados" clickeado (alt)');
              await popup.waitForTimeout(1000);
            }
          }
        } catch (e) {
          console.log('  Tab No integrados no encontrado o ya seleccionado:', e.message);
        }

        await popup.screenshot({ path: path.join(__dirname, 'data', `debug_popup_nointegrados_${rutInfo.rutSinDV}.png`) });

        // Click the select/pencil icon for the provider
        // Look for a clickable element (image, link) in the results row
        let selected = false;
        const selectSelectors = [
          'img[src*="seleccionar"]',
          'img[src*="select"]',
          'img[src*="lapiz"]',
          'img[src*="pencil"]',
          'img[src*="edit"]',
          'a[href*="Seleccionar"]',
          'a[title*="Seleccionar"]',
          'img[alt*="Seleccionar"]',
          'input[type="image"]',
        ];

        for (const selSel of selectSelectors) {
          try {
            const selBtn = popup.locator(selSel).first();
            if (await selBtn.count() > 0) {
              await selBtn.click();
              console.log(`  Proveedor seleccionado (selector: ${selSel})`);
              selected = true;
              break;
            }
          } catch (e) {}
        }

        if (!selected) {
          // Fallback: try clicking any image or link in the results table
          try {
            const imgs = popup.locator('table img, table a').first();
            if (await imgs.count() > 0) {
              await imgs.click();
              console.log('  Proveedor seleccionado (fallback: first table img/link)');
              selected = true;
            }
          } catch (e) {
            console.log('  WARN: No se pudo seleccionar proveedor:', e.message);
          }
        }

        // Wait for dialog and popup to close
        await popup.waitForTimeout(3000);

        // The popup should close after selection + dialog acceptance
        try {
          if (!popup.isClosed()) {
            console.log('  Popup aÃºn abierto, esperando cierre...');
            await popup.waitForEvent('close', { timeout: 10000 }).catch(() => {});
          }
        } catch (e) {}

        console.log('  Proveedor seleccionado correctamente');
        lupaClicked = true;
        break;
      }
    } catch (e) {
      console.log(`  Selector ${selector} fallÃ³: ${e.message.substring(0, 80)}`);
    }
  }

  if (!lupaClicked) {
    // Fallback: try to find ANY clickable element near txtRutProveedor that opens a popup
    console.log('  Intentando encontrar lupa por proximidad...');
    try {
      // Debug: list all images and links on the form
      const allImages = await frame.evaluate(() => {
        const imgs = document.querySelectorAll('img, input[type="image"]');
        return Array.from(imgs).map(img => ({
          src: img.src || img.getAttribute('src'),
          alt: img.alt,
          id: img.id,
          onclick: img.getAttribute('onclick'),
          parentId: img.parentElement?.id
        }));
      });
      console.log('  ImÃ¡genes encontradas:', JSON.stringify(allImages.slice(0, 10)));
    } catch (e) {
      console.log('  Error listando imÃ¡genes:', e.message);
    }
  }

  // Wait for the main page to update after provider selection
  await frame.waitForTimeout(2000);

  // Verify the RUT field was populated
  try {
    const rutValue = await frame.locator('#txtRutProveedor').inputValue();
    console.log(`  RUT en campo despuÃ©s de selecciÃ³n: "${rutValue}"`);
  } catch (e) {
    console.log('  No se pudo leer campo RUT:', e.message);
  }

  // Take screenshot after provider selection
  await page.screenshot({ path: path.join(__dirname, 'data', `debug_after_select_${rutInfo.rutSinDV}.png`), fullPage: true });
}

async function setFilters(frame, page) {
  console.log('Configurando filtros...');

  // Set date range: from 01-01-2025 to today
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
    }
  } catch (e) {
    console.log('  Error leyendo fecha hasta:', e.message);
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

  await page.screenshot({ path: path.join(__dirname, 'data', 'debug_form.png'), fullPage: true });
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

async function clickBuscar(frame, page) {
  console.log('  Clickeando Buscar...');
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
}

async function scrapeRut(frame, page, rutInfo) {
  console.log(`\n=== Procesando ${rutInfo.name} (${rutInfo.rut}) ===`);

  // Step 1: Select provider via popup FIRST (before filters)
  await selectProvider(frame, page, rutInfo);

  // Step 2: Set filters AFTER provider selection
  await setFilters(frame, page);

  // Step 3: Click Buscar
  await clickBuscar(frame, page);

  // Log table info
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
  await page.screenshot({ path: path.join(__dirname, 'data', `debug_search_${rutInfo.rutSinDV}.png`), fullPage: true });

  // Extract all pages
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

    const allResults = {};

    for (const rutInfo of RUTS) {
      // Navigate fresh to the page for each RUT to avoid stale state
      if (RUTS.indexOf(rutInfo) > 0) {
        await page.goto(CONTROL_RECEPCION_URL, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3000);
      }

      // Re-find the frame for each RUT
      let currentFrame = page;
      for (const f of page.frames()) {
        try {
          if (await f.locator('#txtRutProveedor').count() > 0) {
            currentFrame = f;
            break;
          }
        } catch (e) {}
      }

      const data = await scrapeRut(currentFrame, page, rutInfo);
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
