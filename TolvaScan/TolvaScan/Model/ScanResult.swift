import Foundation

/// Resultado de una cubicación de tolva vacía.
struct ScanResult: Equatable {
    /// Volumen interior (capacidad) en metros cúbicos.
    let volumeCubicMeters: Double
    /// Dimensiones aproximadas del bounding box interior (m).
    let width: Double
    let length: Double
    let height: Double
    /// Cantidad de puntos de la malla usados en el cálculo.
    let pointCount: Int
    /// Área de la huella (footprint) cubierta por la malla, en m².
    let footprintArea: Double

    var volumeLiters: Double { volumeCubicMeters * 1000.0 }

    var volumeCubicMetersText: String {
        String(format: "%.3f m³", volumeCubicMeters)
    }

    var volumeLitersText: String {
        String(format: "%.0f L", volumeLiters)
    }

    var dimensionsText: String {
        String(format: "%.2f × %.2f × %.2f m (an × la × al)", width, length, height)
    }
}
