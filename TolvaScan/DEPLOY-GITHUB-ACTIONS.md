# 🤖 Automatización: compilar TolvaScan y subir a TestFlight con GitHub Actions

Con este método **no necesitas ningún Mac** (ni propio ni arrendado): GitHub
compila la app en sus servidores macOS gratis y la sube a TestFlight.

Solo tienes que hacer una configuración inicial (una vez): generar una llave de
App Store Connect y pegar 4 secretos en GitHub. Después, cada build es un clic.

> Requisito: cuenta **Apple Developer** activa (US$99/año).

---

## Paso 1 — Crear el registro de la app en App Store Connect (una vez)

1. Entra a **https://appstoreconnect.apple.com** → **Apps → + → Nueva app**.
2. Completa:
   - Plataforma: **iOS**
   - Nombre: **TolvaScan**
   - Bundle ID: **cl.iconstruye.tolvascan** (si no aparece en la lista, créalo en
     *Certificates, IDs & Profiles → Identifiers → +*, o usa el tuyo y guárdalo
     para el Paso 3 como variable `IOS_BUNDLE_ID`).
   - SKU: cualquier texto, p. ej. `tolvascan001`.

---

## Paso 2 — Generar la API Key de App Store Connect (una vez)

1. En App Store Connect ve a **Users and Access → Integrations → App Store Connect API**.
2. Pulsa **+** para generar una llave. Rol: **App Manager**.
3. Anota:
   - **Issuer ID** (un UUID largo, arriba en la página).
   - **Key ID** (10 caracteres).
4. **Descarga el archivo `.p8`** (¡solo se puede descargar una vez! Guárdalo bien).

## También necesitas tu Team ID

- Está en **https://developer.apple.com/account** → sección *Membership details*
  → **Team ID** (10 caracteres).

---

## Paso 3 — Pegar los secretos en GitHub (una vez)

En el repo: **Settings → Secrets and variables → Actions → pestaña Secrets →
New repository secret**. Crea estos 4:

| Nombre del secreto | Valor |
|---|---|
| `APPLE_TEAM_ID` | Tu Team ID (10 caracteres). |
| `ASC_KEY_ID` | El Key ID de la API Key. |
| `ASC_ISSUER_ID` | El Issuer ID. |
| `ASC_PRIVATE_KEY` | **Todo el contenido** del archivo `.p8` (ábrelo con un editor de texto y copia desde `-----BEGIN PRIVATE KEY-----` hasta `-----END PRIVATE KEY-----`). |

> Si usaste un Bundle ID distinto, ve a la pestaña **Variables** y crea
> `IOS_BUNDLE_ID` con tu valor.

---

## Paso 4 — Ejecutar el workflow

1. Ve a la pestaña **Actions** del repo.
2. Elige **"iOS · Build & TestFlight"** en la lista de la izquierda.
3. Pulsa **Run workflow**, selecciona la rama y confirma.
4. Espera ~10–15 min. Si todo va bien, el build aparecerá en
   **App Store Connect → tu app → TestFlight**.

> ⚠️ **Importante:** el botón **Run workflow** solo aparece si el archivo del
> workflow está en la **rama por defecto** (`main`). Como ahora está en la rama
> `claude/truck-hopper-volume-app-hQSSl`, primero hay que **mergear esa rama a
> `main`** (o avísame y lo preparo). Mientras tanto, también puedes dispararlo
> creando un tag:
> ```bash
> git tag testflight-1 && git push origin testflight-1
> ```

---

## Paso 5 — Instalar en tu iPhone

1. Instala la app **TestFlight** desde la App Store.
2. En App Store Connect → tu app → **TestFlight → Pruebas internas**, agrégate
   como tester con tu Apple ID.
3. Acepta la invitación que te llega por correo desde tu iPhone, abre TestFlight
   e **Instala** TolvaScan.
4. Abre la app, da permiso de **cámara**, y escanea el interior de la tolva. 🎉

---

## Notas

- Cada ejecución usa el **número de run** como build number, así que siempre sube
  una versión nueva (App Store Connect lo exige).
- La pregunta de **cifrado de exportación** ya está resuelta en el proyecto
  (`ITSAppUsesNonExemptEncryption = false`), así que el build queda disponible solo.
- La firma es **automática** vía la API Key (`-allowProvisioningUpdates`): no
  tienes que manejar certificados ni perfiles a mano.

### Si algo falla
- Revisa el log del paso que falló en la pestaña **Actions**.
- Errores típicos: secreto mal pegado (especialmente el `.p8`), Team ID
  incorrecto, o que el registro de la app aún no exista en App Store Connect.
- Pásame el mensaje de error y te lo corrijo.
