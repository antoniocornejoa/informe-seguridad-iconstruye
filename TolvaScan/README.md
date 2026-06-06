# TolvaScan 🚛📐

Prototipo de app iOS para **cubicar la capacidad interior de una tolva de camión vacía** usando el sensor **LiDAR** del iPhone/iPad Pro.

La app escanea el interior de la tolva con ARKit (reconstrucción de malla), estima el plano del borde superior y calcula el volumen interior por **integración de columnas** sobre la malla 3D. El resultado se entrega en **m³ y litros**, con un control para ajustar finamente la altura del borde.

## Requisitos

- iPhone o iPad **Pro con LiDAR** (iPhone 12 Pro o superior).
- iOS 16+.
- Mac con **Xcode 15+** para compilar e instalar.

> El simulador de iOS **no** tiene LiDAR ni cámara: la app debe ejecutarse en un dispositivo físico.

## Generar el proyecto Xcode

El proyecto se define con [XcodeGen](https://github.com/yonaskolb/XcodeGen) para mantener
el repo limpio (sin el `.xcodeproj` versionado).

```bash
# 1. Instalar XcodeGen (una sola vez)
brew install xcodegen

# 2. Generar el proyecto
cd TolvaScan
xcodegen generate

# 3. Abrir en Xcode
open TolvaScan.xcodeproj
```

En Xcode: selecciona tu equipo de firma (Signing & Capabilities → Team), conecta el
iPhone Pro y presiona **Run** (▶︎).

### Alternativa sin XcodeGen

Si prefieres no usar XcodeGen, crea un proyecto **iOS App (SwiftUI)** nuevo en Xcode,
arrastra la carpeta `TolvaScan/TolvaScan/` al proyecto y agrega en el Info.plist la clave
`NSCameraUsageDescription`.

## Cómo se usa

1. Abre la app y presiona **Iniciar escaneo**.
2. Apunta al interior de la tolva vacía y mueve el teléfono lentamente, cubriendo
   **fondo, paredes y todo el borde superior**.
3. Presiona **Calcular volumen**.
4. Revisa la capacidad estimada (m³ / L). Usa el deslizador **Ajuste del borde
   superior** para calzar el plano con el borde real y afinar el resultado.

## Cómo funciona el cálculo

Archivo clave: [`Model/VolumeCalculator.swift`](TolvaScan/Model/VolumeCalculator.swift).

- El eje **Y** de ARKit se alinea con la gravedad (`worldAlignment = .gravity`).
- Los vértices de la malla se proyectan a una **grilla horizontal X–Z** (celdas de 2.5 cm).
- Por cada celda se toma el punto **más bajo** (piso interior de esa columna).
- El **borde superior** (`rimY`) se estima como un percentil alto (97%) de las alturas,
  ajustable por el usuario.
- Volumen = Σ `(rimY − pisoCelda) · áreaCelda`.

## Precisión y limitaciones

- En buenas condiciones la precisión es del orden de **±2–5%**.
- Afectan negativamente: polvo en suspensión, superficies muy reflectantes/oscuras,
  poca luz, escaneo incompleto del borde.
- Es una herramienta **referencial**, no un instrumento certificado de medición legal.

## Estructura del código

```
TolvaScan/
├── project.yml                 # Definición XcodeGen
└── TolvaScan/
    ├── App/TolvaScanApp.swift  # Punto de entrada
    ├── Model/
    │   ├── ScanResult.swift    # Modelo del resultado
    │   └── VolumeCalculator.swift
    ├── AR/
    │   ├── MeshExtraction.swift  # Lectura de vértices de la malla LiDAR
    │   └── ScanModel.swift       # Sesión ARKit + estado (ObservableObject)
    └── Views/
        ├── ContentView.swift     # Máquina de estados de la UI
        ├── ARScannerView.swift   # Wrapper de ARView
        └── ResultView.swift      # Resultado + ajuste de borde
```

## Próximos pasos posibles

- Definir el borde por toque (raycast) en lugar de percentil automático.
- Guardar historial de mediciones y exportar a PDF/CSV.
- Cubicar también **material a granel** (volumen del montón sobre el fondo).
- Modo de calibración con objeto de tamaño conocido para validar precisión.
