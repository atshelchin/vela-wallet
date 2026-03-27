import SwiftUI

// MARK: - Navigation Bar

struct VelaNavBar: View {
    let title: LocalizedStringResource
    var onBack: (() -> Void)?

    var body: some View {
        HStack {
            if let onBack {
                Button(action: onBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(VelaColor.textPrimary)
                        .frame(width: 36, height: 36)
                }
            } else {
                Spacer().frame(width: 36)
            }

            Spacer()

            Text(title)
                .font(VelaFont.title(17))
                .foregroundStyle(VelaColor.textPrimary)

            Spacer()
            Spacer().frame(width: 36)
        }
        .padding(.horizontal, VelaSpacing.screenH)
        .padding(.vertical, 8)
    }
}

// MARK: - Section Header

struct SectionHeader: View {
    let title: LocalizedStringResource

    var body: some View {
        Text(title)
            .font(.system(size: 11, weight: .semibold))
            .tracking(1.5)
            .foregroundStyle(VelaColor.textTertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, VelaSpacing.screenH)
    }
}

// MARK: - Network Dot

struct NetworkDot: View {
    var color: Color = VelaColor.green
    var size: CGFloat = 7

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
    }
}

// MARK: - Token Icon

struct TokenIcon: View {
    let label: String
    let color: Color
    let bg: Color
    var size: CGFloat = 42

    var body: some View {
        ZStack {
            Circle()
                .fill(bg)
            Text(label)
                .font(VelaFont.label(size * 0.38))
                .foregroundStyle(color)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Network Icon

struct NetworkIcon: View {
    let network: Network
    var size: CGFloat = 40

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.3)
                .fill(network.iconBg)
            Text(network.iconLabel)
                .font(VelaFont.label(size * 0.35))
                .foregroundStyle(network.iconColor)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Sail Logo

struct VelaSailLogo: View {
    var size: CGFloat = 80
    var color: Color = VelaColor.accent

    var body: some View {
        Canvas { context, canvasSize in
            let w = canvasSize.width
            let h = canvasSize.height

            // Sail shape
            var sail = Path()
            sail.move(to: CGPoint(x: w * 0.475, y: h * 0.15))
            sail.addQuadCurve(
                to: CGPoint(x: w * 0.225, y: h * 0.8),
                control: CGPoint(x: w * 0.3, y: h * 0.5)
            )
            sail.addQuadCurve(
                to: CGPoint(x: w * 0.5, y: h * 0.675),
                control: CGPoint(x: w * 0.4, y: h * 0.72)
            )
            sail.addQuadCurve(
                to: CGPoint(x: w * 0.775, y: h * 0.8),
                control: CGPoint(x: w * 0.6, y: h * 0.72)
            )
            sail.addQuadCurve(
                to: CGPoint(x: w * 0.525, y: h * 0.15),
                control: CGPoint(x: w * 0.7, y: h * 0.5)
            )
            sail.closeSubpath()
            context.fill(sail, with: .color(color))

            // Mast
            var mast = Path()
            mast.move(to: CGPoint(x: w * 0.5, y: h * 0.675))
            mast.addLine(to: CGPoint(x: w * 0.5, y: h * 0.9))
            context.stroke(mast, with: .color(color), lineWidth: 2)

            // Base line
            var base = Path()
            base.move(to: CGPoint(x: w * 0.375, y: h * 0.9))
            base.addLine(to: CGPoint(x: w * 0.625, y: h * 0.9))
            context.stroke(base, with: .color(color.opacity(0.4)), lineWidth: 1.5)
        }
        .frame(width: size, height: size)
    }
}
