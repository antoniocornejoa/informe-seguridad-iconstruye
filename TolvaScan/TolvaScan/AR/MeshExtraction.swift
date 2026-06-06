import ARKit
import simd

extension ARMeshGeometry {
    /// Devuelve el vértice (en el espacio local del anchor) en el índice dado.
    func vertex(at index: UInt32) -> SIMD3<Float> {
        assert(vertices.format == .float3, "Se asume formato float3 para los vértices de la malla")
        let pointer = vertices.buffer.contents()
            .advanced(by: vertices.offset + (vertices.stride * Int(index)))
        return pointer.assumingMemoryBound(to: SIMD3<Float>.self).pointee
    }
}

extension ARMeshAnchor {
    /// Vértices de la malla transformados al espacio del mundo.
    func worldSpaceVertices() -> [SIMD3<Float>] {
        let count = geometry.vertices.count
        var result = [SIMD3<Float>]()
        result.reserveCapacity(count)
        for index in 0..<count {
            let local = geometry.vertex(at: UInt32(index))
            let world = transform * SIMD4<Float>(local, 1)
            result.append(SIMD3<Float>(world.x, world.y, world.z))
        }
        return result
    }
}
