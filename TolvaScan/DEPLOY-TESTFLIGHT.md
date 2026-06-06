# 📲 Guía: instalar TolvaScan (LiDAR) en tu iPhone sin tener un Mac

Esta guía te lleva desde cero hasta tener la app **TolvaScan con escaneo LiDAR**
corriendo en tu iPhone, usando un **Mac arrendado por internet** y **TestFlight**.
No necesitas comprar un Mac.

> ⏱️ Tiempo estimado la primera vez: **2 a 4 horas**.
> 💰 Costo: **US$99/año** (Apple Developer) + **~US$1–2/hora** del Mac en la nube
> (unas pocas horas en total). El Apple Developer es obligatorio para TestFlight.

---

## Resumen del camino

```
Cuenta Apple Developer  →  Mac en la nube + Xcode  →  Compilar y subir
        ($99/año)             (MacinCloud)              a App Store Connect
                                                              │
                                                              ▼
   iPhone: app TestFlight  ◄────────  Invitación TestFlight
```

---

## PARTE 0 — Requisito previo: cuenta Apple Developer

1. Entra a **https://developer.apple.com/programs/** y pulsa **Enroll**.
2. Inicia sesión con tu **Apple ID** (el mismo de tu iPhone).
3. Inscríbete como **Individuo**. Paga la membresía anual (**US$99**).
4. La aprobación suele tardar de **unos minutos a 48 horas**. No sigas hasta tenerla activa.

> Sin esta cuenta NO se puede usar TestFlight. Es el único costo realmente obligatorio.

---

## PARTE 1 — Arrendar un Mac en la nube

Recomendado: **MacinCloud** (https://www.macincloud.com).

1. Crea una cuenta.
2. Elige un plan con **Xcode ya preinstalado** (los planes *Managed Server* lo traen).
   Así te ahorras ~1–2 horas y varios GB de descarga.
   - Si eliges *Pay As You Go* (~US$1/hr), quizá debas instalar Xcode tú mismo
     desde la **Mac App Store** (gratis, pero pesado: ~12 GB).
3. Conéctate al Mac desde tu navegador o por **RDP/VNC** (MacinCloud te da el acceso).

> Alternativas equivalentes: **MacStadium**, **AWS EC2 Mac** (más caro, mínimo 24 h).

---

## PARTE 2 — Compilar la app en el Mac en la nube

Ya conectado al Mac, abre la app **Terminal** y ejecuta:

```bash
# 1. Instalar Homebrew (si no está)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Instalar XcodeGen
brew install xcodegen

# 3. Descargar el código
git clone https://github.com/antoniocornejoa/informe-seguridad-iconstruye.git
cd informe-seguridad-iconstruye
git checkout claude/truck-hopper-volume-app-hQSSl

# 4. Generar el proyecto Xcode
cd TolvaScan
xcodegen generate
open TolvaScan.xcodeproj
```

Se abre **Xcode**. Ahora:

5. En la barra lateral selecciona el proyecto **TolvaScan** → pestaña
   **Signing & Capabilities**.
6. Marca **Automatically manage signing**.
7. En **Team**, elige tu cuenta (la del Apple Developer). Inicia sesión en
   Xcode con tu Apple ID si te lo pide: menú **Xcode → Settings → Accounts → +**.
8. Si el **Bundle Identifier** `cl.iconstruye.tolvascan` da error de "ya en uso",
   cámbialo por algo único, p. ej. `cl.tunombre.tolvascan`.

### Generar el build para TestFlight

9. Arriba, en el selector de dispositivo, elige **Any iOS Device (arm64)**
   (no un simulador).
10. Menú **Product → Archive**. Espera a que compile.
11. Se abre el **Organizer**. Pulsa **Distribute App → App Store Connect → Upload**.
    Sigue el asistente (deja las opciones por defecto) y **Upload**.

> La primera vez Xcode crea solo los certificados y perfiles. Acepta cuando lo pida.

---

## PARTE 3 — Configurar TestFlight en App Store Connect

1. Entra a **https://appstoreconnect.apple.com** → **Apps**.
2. Si la app no existe, pulsa **+ → Nueva app**:
   - Plataforma: **iOS**
   - Nombre: **TolvaScan**
   - Bundle ID: el mismo que usaste en Xcode (`cl.iconstruye.tolvascan` o el tuyo)
   - SKU: cualquier texto, p. ej. `tolvascan001`
3. Abre la app → pestaña **TestFlight**.
4. Espera unos minutos a que tu build pase de *Processing* a listo.
5. Si pide responder sobre **cifrado de exportación**, responde **No**
   (la app no usa cifrado propio).
6. En **Pruebas internas** crea un grupo y **agrégate como tester** con tu
   correo de Apple ID.

---

## PARTE 4 — Instalar en tu iPhone

1. En tu iPhone, instala la app **TestFlight** desde la App Store.
2. Te llegará un **correo de invitación** (o un código de canje). Ábrelo desde el iPhone.
3. TestFlight abre la invitación → pulsa **Aceptar** e **Instalar**.
4. ¡Listo! Abre **TolvaScan**, dale permiso de **cámara** y escanea el interior
   de la tolva moviendo el teléfono. Presiona **Calcular volumen**.

> Los builds de TestFlight caducan a los **90 días**. Para renovar, repites
> la Parte 2 (Archive + Upload) — ya con todo configurado toma ~10 minutos.

---

## Problemas frecuentes

| Síntoma | Solución |
|---|---|
| "No account for team" en Xcode | Xcode → Settings → Accounts → inicia sesión con tu Apple ID. |
| Bundle ID en uso | Cámbialo a uno único (`cl.tunombre.tolvascan`) en Signing. |
| El build no aparece en TestFlight | Espera 5–15 min (procesamiento) y refresca. |
| "Missing compliance" | Responde la pregunta de cifrado de exportación con **No**. |
| Archive deshabilitado | Selecciona **Any iOS Device**, no un simulador. |

---

## ¿Prefieres no tocar el Mac casi nada?

Existe una alternativa **automática con GitHub Actions** (compilación gratis en
los servidores macOS de GitHub, sin arrendar Mac): tú solo creas una *API Key* en
App Store Connect y la pegas como secreto en GitHub; el resto lo hace un workflow.
Si te interesa, pídemelo y te lo dejo configurado.
