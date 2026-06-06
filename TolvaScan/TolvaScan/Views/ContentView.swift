import SwiftUI

struct ContentView: View {
    @StateObject private var model = ScanModel()

    var body: some View {
        ZStack {
            switch model.phase {
            case .ready:
                readyView
            case .scanning:
                scanningView
            case .computing:
                computingView
            case .result(let result):
                ResultView(result: result, model: model)
            case .error(let message):
                errorView(message)
            }
        }
        .animation(.default, value: model.phase)
    }

    // MARK: - Pantallas

    private var readyView: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "cube.transparent")
                .font(.system(size: 72))
                .foregroundStyle(.tint)
            Text("TolvaScan")
                .font(.largeTitle.bold())
            Text("Cubica la capacidad interior de una tolva vacía con el LiDAR de tu iPhone.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)

            if !model.isSupported {
                Label("Este dispositivo no tiene LiDAR. Se requiere iPhone/iPad Pro.",
                      systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(.orange)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Spacer()
            instructions
            Button(action: model.startScan) {
                Label("Iniciar escaneo", systemImage: "viewfinder")
                    .frame(maxWidth: .infinity)
                    .padding()
            }
            .buttonStyle(.borderedProminent)
            .disabled(!model.isSupported)
            .padding(.horizontal)
            .padding(.bottom)
        }
    }

    private var instructions: some View {
        VStack(alignment: .leading, spacing: 8) {
            instructionRow("1.", "Apunta al interior de la tolva vacía.")
            instructionRow("2.", "Mueve lentamente el teléfono cubriendo paredes y fondo.")
            instructionRow("3.", "Incluye el borde superior completo.")
            instructionRow("4.", "Presiona «Calcular» al terminar.")
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal)
    }

    private func instructionRow(_ n: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(n).fontWeight(.bold).foregroundStyle(.tint)
            Text(text).font(.subheadline)
        }
    }

    private var scanningView: some View {
        ZStack {
            ARScannerView(model: model)
                .ignoresSafeArea()
            VStack {
                HStack {
                    Label("\(model.meshAnchorCount) zonas", systemImage: "square.grid.3x3.fill")
                        .padding(8)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                    Spacer()
                }
                .padding()
                Spacer()
                Text("Mueve el teléfono para cubrir todo el interior")
                    .font(.subheadline)
                    .padding(10)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
                Button(action: model.finishScan) {
                    Label("Calcular volumen", systemImage: "function")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                .buttonStyle(.borderedProminent)
                .padding()
            }
        }
    }

    private var computingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.5)
            Text("Calculando volumen…")
                .foregroundStyle(.secondary)
        }
    }

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 20) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 56))
                .foregroundStyle(.orange)
            Text(message)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
            Button("Volver", action: model.reset)
                .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
