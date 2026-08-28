// swift-tools-version:5.9
import PackageDescription

// iOS 17.4, not 17.0 (spec 019-onboarding-live-wiring, research D6).
//
// `ASAuthorizationPlatformPublicKeyCredentialProvider`'s
// `excludedCredentials` landed in 17.4, and a founding key set cannot be built
// without it: registering a second passkey with no exclude list lets the
// provider silently REPLACE the first, and the Safe address depends on every
// key in the set. A wallet built that way derives to an address nothing can
// deploy.
//
// This number and the app target's IPHONEOS_DEPLOYMENT_TARGET must move
// TOGETHER. A package that allows 17.0 while the app requires 17.4 compiles and
// then fails to link on the older runtime it claimed to support.
//
// Spelled as a STRING rather than as `.v17_4`: the enum case needs a newer
// swift-tools-version than this package declares, and raising the tools version
// would also switch the default language mode — a Swift 6 concurrency migration
// is not something to take on as a side effect of a deployment-target bump.
// `.iOS("17.4")` is the same constraint.
let package = Package(
    name: "VelaCoreKit",
    platforms: [.iOS("17.4")],
    products: [
        .library(name: "VelaCore", targets: ["VelaCore"])
    ],
    targets: [
        .binaryTarget(name: "VelaCoreFFI", path: "Artifacts/VelaCoreFFI.xcframework"),
        .target(name: "VelaCore", dependencies: ["VelaCoreFFI"], path: "Sources/VelaCore"),
    ]
)
