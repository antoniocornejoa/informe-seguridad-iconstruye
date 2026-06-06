import Foundation
import simd

enum VolumeError: LocalizedError {
    case notEnoughData

    var errorDescription: String? {
        switch self {
        case .notEnoughData:
            return "No se capturaron suficientes puntos. Acércate y escanea todo el interior de la tolva."
        }
    }
}

/// Calcula la capacidad de una tolva (abierta por arriba) por integración de columnas.
///
/// Estrategia
/// ----------
/// El eje Y de ARKit está alineado con la gravedad (hacia arriba). Se proyectan
/// todos los vértices de la malla sobre una grilla horizontal X–Z. Para cada celda
/// se toma el punto más bajo (el piso interior de la tolva en esa columna). El plano
/// del borde superior (`rimY`) se estima como un percentil alto de las alturas. El
/// volumen es la suma, por celda con datos, de `(rimY − pisoCelda) · áreaCelda`.
///
/// `rimOffset` permite al usuario ajustar finamente la altura del borde (en metros)
/// para calzar con el borde real de la tolva.
struct VolumeCalculator {
    /// Tamaño de celda de la grilla, en metros.
    var cellSize: Float = 0.025
    /// Percentil (0–1) de altura usado para estimar el plano del borde.
    var rimPercentile: Float = 0.97

    func computeVolume(vertices: [SIMD3<Float>], rimOffset: Float = 0) throws -> ScanResult {
        guard vertices.count > 500 else { throw VolumeError.notEnoughData }

        // Extensión vertical y estimación del plano del borde.
        let ys = vertices.map { $0.y }.sorted()
        let minY = ys.first!
        let percIndex = min(ys.count - 1, Int(Float(ys.count - 1) * rimPercentile))
        let rimY = ys[percIndex] + rimOffset

        guard rimY > minY else { throw VolumeError.notEnoughData }

        // Grilla horizontal: para cada celda guardamos la altura mínima (piso).
        struct Cell: Hashable { let i: Int; let j: Int }
        var floorByCell: [Cell: Float] = [:]
        floorByCell.reserveCapacity(vertices.count / 4)

        var minX = Float.greatestFiniteMagnitude, maxX = -Float.greatestFiniteMagnitude
        var minZ = Float.greatestFiniteMagnitude, maxZ = -Float.greatestFiniteMagnitude

        for v in vertices {
            // Ignoramos puntos por encima del borde (ruido, techo, etc.).
            if v.y > rimY { continue }
            let cell = Cell(i: Int((v.x / cellSize).rounded(.down)),
                            j: Int((v.z / cellSize).rounded(.down)))
            if let current = floorByCell[cell] {
                if v.y < current { floorByCell[cell] = v.y }
            } else {
                floorByCell[cell] = v.y
            }
            minX = min(minX, v.x); maxX = max(maxX, v.x)
            minZ = min(minZ, v.z); maxZ = max(maxZ, v.z)
        }

        let cellArea = Double(cellSize * cellSize)
        var volume = 0.0
        for (_, floorY) in floorByCell {
            let h = rimY - floorY
            if h > 0 { volume += Double(h) * cellArea }
        }

        guard volume > 0 else { throw VolumeError.notEnoughData }

        let footprintArea = Double(floorByCell.count) * cellArea
        return ScanResult(
            volumeCubicMeters: volume,
            width: Double(maxX - minX),
            length: Double(maxZ - minZ),
            height: Double(rimY - minY),
            pointCount: vertices.count,
            footprintArea: footprintArea
        )
    }
}
