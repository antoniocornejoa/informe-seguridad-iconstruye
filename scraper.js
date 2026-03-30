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
  // Remove any existing dialog handlers to avoid stacking
  page.removeAllListeners('dialog');
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
              await rutInput.fill(rutInfo.rut);
              console.log(`  RUT ingresado en popup: ${rutInfo.rut} (selector: ${rutSel})`);
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
            await inputs.first().fill(rutInfo.rut);
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

  // First: Set Centro de GestiÃ³n OC to "Todos" (last option in dropdown)
  try {
    // Find all select elements and log them for debugging
    const selectInfo = await frame.evaluate(() => {
      const selects = document.querySelectorAll('select');
      return Array.from(selects).map(s => ({
        id: s.id,
        name: s.name,
        optionCount: s.options.length,
        firstOption: s.options[0]?.text,
        lastOption: s.options[s.options.length - 1]?.text,
        lastOptionValue: s.options[s.options.length - 1]?.value,
        selectedText: s.options[s.selectedIndex]?.text
      }));
    });
    console.log('  Dropdowns encontrados:', JSON.stringify(selectInfo, null, 2));

    // Set Centro de GestiÃ³n OC to "Todos"
    for (const sel of selectInfo) {
      if (sel.id && (sel.id.toLowerCase().includes('centrogestion') || sel.id.toLowerCase().includes('centro'))) {
        const selectEl = frame.locator(`#${sel.id}`);
        if (await selectEl.count() > 0) {
          // Select "Todos" - try the last option value first (usually "Todos" is at the end)
          try {
            await selectEl.selectOption({ label: 'Todos' });
            console.log(`  ${sel.id}: Seleccionado "Todos" por label`);
          } catch (e) {
            // Try selecting by value - "Todos" might have value "" or "-1" or "0"
            try {
              await selectEl.selectOption(sel.lastOptionValue);
              console.log(`  ${sel.id}: Seleccionado Ãºltimo valor "${sel.lastOptionValue}" (${sel.lastOption})`);
            } catch (e2) {
              console.log(`  ${sel.id}: No se pudo seleccionar Todos: ${e2.message}`);
            }
          }
          // Wait for postback that may occur on dropdown change
          await frame.waitForTimeout(2000);
        }
      }
    }
  } catch (e) {
    console.log('  Error configurando Centro de GestiÃ³n:', e.message);
  }

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
  const pageInfo = await frame.evaluate(() => {
    // Find all links that look like pagination
    const allLinks = document.querySelectorAll('a[href*="__doPostBack"]');
    let maxPage = 1;
    const paginationLinks = [];

    for (const link of allLinks) {
      const href = link.href || '';
      const text = link.textContent.trim();
      const num = parseInt(text);

      // Check if this is a numeric page link
      if (!isNaN(num) && num > 0 && num <= 200) {
        // Extract __doPostBack parameters
        const match = href.match(/__doPostBack\('([^']+)'\s*,\s*'([^']*)'\)/);
        if (match) {
          paginationLinks.push({
            pageNum: num,
            text,
            eventTarget: match[1],
            eventArg: match[2]
          });
          if (num > maxPage) maxPage = num;
        }
      }
    }

    return { maxPage, paginationLinks };
  });

  console.log(`  Pagination info: maxPage=${pageInfo.maxPage}, links found=${pageInfo.paginationLinks.length}`);
  if (pageInfo.paginationLinks.length > 0) {
    console.log(`  Sample pagination links:`, JSON.stringify(pageInfo.paginationLinks.slice(0, 3)));
  }

  return pageInfo;
}

async function navigateToPage(frame, pageNum, pageInfo) {
  // Find the exact postback parameters for this page from the detected links
  const linkInfo = pageInfo.paginationLinks.find(l => l.pageNum === pageNum);

  // Capture current ViewState to detect when postback completes
  const viewStateBefore = await frame.evaluate(() => {
    const vs = document.getElementById('__VIEWSTATE');
    return vs ? vs.value.substring(0, 30) : '';
  });

  if (linkInfo) {
    console.log(`  Navigating to page ${pageNum}: __doPostBack('${linkInfo.eventTarget}', '${linkInfo.eventArg}')`);
    // Trigger the postback with the correct parameters parsed from the actual link
    await frame.evaluate(({ target, arg }) => {
      __doPostBack(target, arg);
    }, { target: linkInfo.eventTarget, arg: linkInfo.eventArg });
  } else {
    // Fallback: try clicking the link element directly by matching text
    console.log(`  No parsed link for page ${pageNum}, trying click by text...`);
    let clicked = false;
    try {
      // Find links that contain just the page number as text
      const linkCount = await frame.locator('a[href*="__doPostBack"]').count();
      for (let i = 0; i < linkCount; i++) {
        const link = frame.locator('a[href*="__doPostBack"]').nth(i);
        const text = await link.textContent();
        if (text && text.trim() === pageNum.toString()) {
          await link.click();
          clicked = true;
          console.log(`  Clicked pagination link with text "${pageNum}"`);
          break;
        }
      }
    } catch (e) {
      console.log(`  Link click error: ${e.message.substring(0, 80)}`);
    }

    if (!clicked) {
      console.log(`  Last resort: __doPostBack('IrA', '${pageNum}')`);
      await frame.evaluate((num) => {
        __doPostBack('IrA', num.toString());
      }, pageNum);
    }
  }

  // Wait for the postback to complete by checking if the ViewState changed
  // This is the most reliable way to detect ASP.NET postback completion
  try {
    await frame.waitForFunction((oldVS) => {
      const vs = document.getElementById('__VIEWSTATE');
      if (!vs) return true; // If no ViewState, page might have changed entirely
      return vs.value.substring(0, 30) !== oldVS;
    }, viewStateBefore, { timeout: 30000 });
    console.log(`  ViewState changed - postback completed for page ${pageNum}`);
  } catch (e) {
    console.log(`  ViewState wait timeout for page ${pageNum}, falling back to delay...`);
    await frame.waitForTimeout(8000);
  }

  // Extra wait for table rendering
  await frame.waitForTimeout(1500);

  try {
    await frame.waitForSelector('#tblDetalle', { timeout: 15000 });
  } catch (e) {
    console.log(`  Tabla no encontrada en pÃ¡gina ${pageNum}, esperando mÃ¡s...`);
    await frame.waitForTimeout(5000);
  }

  // Debug: verify what we got
  const tableCheck = await frame.evaluate(() => {
    const table = document.getElementById('tblDetalle');
    if (!table) return { found: false, url: window.location.href.substring(0, 100) };
    const rows = table.querySelectorAll('tr');
    const firstRowText = rows.length > 1 ? rows[1].textContent.substring(0, 100) : '';
    return { found: true, rowCount: rows.length - 1, firstRowPreview: firstRowText };
  });
  console.log(`  Table check page ${pageNum}:`, JSON.stringify(tableCheck));
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
  const pageInfo = await getPageCount(frame);
  console.log(`  Total de pÃ¡ginas: ${pageInfo.maxPage}`);

  for (let p = 1; p <= pageInfo.maxPage; p++) {
    if (p > 1) {
      await navigateToPage(frame, p, pageInfo);
    }
    const pageData = await extractTableData(frame);
    console.log(`  PÃ¡gina ${p}: ${pageData.length} filas`);
    allData = allData.concat(pageData);

    // If after navigation we get 0 rows and we're past page 1, the pagination may not be working
    // Try re-fetching page info in case the links changed after navigation
    if (p > 1 && pageData.length === 0) {
      console.log(`  WARNING: 0 rows on page ${p}, checking if frame is still valid...`);
      const recheck = await frame.evaluate(() => {
        const table = document.getElementById('tblDetalle');
        const form = document.getElementById('form1') || document.forms[0];
        return {
          hasTable: !!table,
          hasForm: !!form,
          url: window.location.href.substring(0, 120),
          bodyLen: document.body?.innerHTML?.length || 0
        };
      }).catch(e => ({ error: e.message }));
      console.log(`  Frame recheck:`, JSON.stringify(recheck));
    }
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
