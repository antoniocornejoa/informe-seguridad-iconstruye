import SwiftUI
import RealityKit
import ARKit
import Combine

/// Estados del flujo de cubicación.
enum ScanPhase: Equatable {
    case ready
    case scanning
    case computing
    case result(ScanResult)
    case error(String)
}

/// Coordina la sesión ARKit (captura de malla LiDAR) y expone el estado a SwiftUI.
@MainActor
final class ScanModel: NSObject, ObservableObject {
    @Published private(set) var phase: ScanPhase = .ready
    @Published private(set) var meshAnchorCount: Int = 0
    /// Ajuste fino del borde superior, en centímetros (puede ser negativo).
    @Published var rimOffsetCm: Double = 0 {
        didSet { recomputeIfPossible() }
    }

    let isSupported: Bool = ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh)

    private weak var arView: ARView?
    private var capturedVertices: [SIMD3<Float>] = []
    private let calculator = VolumeCalculator()

    func attach(to arView: ARView) {
        self.arView = arView
        arView.session.delegate = self
        arView.debugOptions.insert(.showSceneUnderstanding)
    }

    func startScan() {
        guard isSupported, let arView else {
            phase = .error("Este dispositivo no tiene LiDAR. Se requiere un iPhone/iPad Pro.")
            return
        }
        capturedVertices = []
        meshAnchorCount = 0

        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravity
        config.sceneReconstruction = .mesh
        config.environmentTexturing = .none
        arView.session.run(config, options: [.resetSceneReconstruction, .removeExistingAnchors])
        phase = .scanning
    }

    func finishScan() {
        guard let arView else { return }
        phase = .computing

        // Recolectamos todos los anchors de malla actuales.
        let meshAnchors = (arView.session.currentFrame?.anchors ?? [])
            .compactMap { $0 as? ARMeshAnchor }

        arView.session.pause()

        Task.detached(priority: .userInitiated) { [meshAnchors] in
            var vertices: [SIMD3<Float>] = []
            for anchor in meshAnchors {
                vertices.append(contentsOf: anchor.worldSpaceVertices())
            }
            await MainActor.run {
                self.capturedVertices = vertices
                self.compute()
            }
        }
    }

    func reset() {
        capturedVertices = []
        meshAnchorCount = 0
        rimOffsetCm = 0
        phase = .ready
    }

    private func compute() {
        do {
            let result = try calculator.computeVolume(
                vertices: capturedVertices,
                rimOffset: Float(rimOffsetCm / 100.0)
            )
            phase = .result(result)
        } catch {
            phase = .error(error.localizedDescription)
        }
    }

    private func recomputeIfPossible() {
        guard case .result = phase, !capturedVertices.isEmpty else { return }
        compute()
    }
}

extension ScanModel: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        let added = anchors.compactMap { $0 as? ARMeshAnchor }.count
        guard added > 0 else { return }
        Task { @MainActor in self.meshAnchorCount += added }
    }

    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        Task { @MainActor in self.phase = .error(error.localizedDescription) }
    }
}
