// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "VelaCoreKit",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "VelaCore", targets: ["VelaCore"])
    ],
    targets: [
        .binaryTarget(name: "VelaCoreFFI", path: "Artifacts/VelaCoreFFI.xcframework"),
        .target(name: "VelaCore", dependencies: ["VelaCoreFFI"], path: "Sources/VelaCore"),
    ]
)
