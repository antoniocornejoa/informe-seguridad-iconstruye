import SwiftUI
import RealityKit
import ARKit

/// Envuelve un `ARView` de RealityKit y lo conecta al `ScanModel`.
struct ARScannerView: UIViewRepresentable {
    @ObservedObject var model: ScanModel

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        arView.automaticallyConfigureSession = false
        model.attach(to: arView)
        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}
}
