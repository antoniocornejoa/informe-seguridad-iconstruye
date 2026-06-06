import SwiftUI

/// Muestra el resultado de la cubicación y permite ajustar el borde y reescanear.
struct ResultView: View {
    let result: ScanResult
    @ObservedObject var model: ScanModel

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                VStack(spacing: 4) {
                    Text("Capacidad estimada")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(result.volumeCubicMetersText)
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                    Text(result.volumeLitersText)
                        .font(.title3)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 12) {
                    infoRow("Dimensiones interiores", result.dimensionsText)
                    infoRow("Huella escaneada", String(format: "%.2f m²", result.footprintArea))
                    infoRow("Puntos de malla", "\(result.pointCount)")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                VStack(alignment: .leading, spacing: 8) {
                    Text("Ajuste del borde superior")
                        .font(.headline)
                    Text("Mueve el control para calzar el plano del borde con el borde real de la tolva.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack {
                        Text(String(format: "%+.0f cm", model.rimOffsetCm))
                            .monospacedDigit()
                            .frame(width: 70, alignment: .leading)
                        Slider(value: $model.rimOffsetCm, in: -50...50, step: 1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color(.secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 16))

                Button(action: model.reset) {
                    Label("Escanear de nuevo", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity)
                        .padding()
                }
                .buttonStyle(.borderedProminent)

                Text("Estimación referencial. La precisión depende de la calidad del escaneo, la iluminación y la regularidad del interior.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
        }
    }

    private func infoRow(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
        .font(.subheadline)
    }
}
