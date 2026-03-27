# Informe de Seguridad - iConstruye

Scraping automatizado de recepciones de proveedores de seguridad desde iConstruye, con generación de informe HTML interactivo.

## Proveedores monitoreados

- **VSM ASOCIADOS SPA** (76230752-9)
- **Sociedad Guardias de Talca Ltda.** (77543490-2)

## Configuración

### Secretos requeridos en GitHub

En Settings > Secrets and variables > Actions, crear:

- `ICONSTRUYE_USER` - Usuario de iConstruye
- `ICONSTRUYE_PASS` - Contraseña de iConstruye

### Ejecución

El workflow se ejecuta automáticamente todos los días a las 9:00 AM (hora Chile). También se puede ejecutar manualmente desde Actions > "Informe Seguridad - Scraping Diario" > Run workflow.

### Local

```bash
npm install
npx playwright install chromium
ICONSTRUYE_USER=tu_usuario ICONSTRUYE_PASS=tu_pass npm run all
```

## Estructura

- `scraper.js` - Script de scraping con Playwright
- `generate_report.js` - Generador del informe HTML
- `data/raw_data.json` - Datos crudos del último scraping
- `output/informe_seguridad_recepciones.html` - Informe HTML interactivo
- `.github/workflows/daily-report.yml` - Workflow de GitHub Actions
