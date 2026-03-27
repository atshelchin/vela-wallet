import SwiftUI

/// Image loader with disk + memory cache. Images are cached permanently after first download.
struct CachedAsyncImage<Placeholder: View>: View {
    let url: URL?
    @ViewBuilder let placeholder: () -> Placeholder

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
        } else if failed {
            placeholder()
        } else {
            placeholder()
                .task(id: url) {
                    guard let url else { failed = true; return }
                    if let cached = ImageCache.shared.get(for: url) {
                        image = cached
                    } else {
                        do {
                            let (data, response) = try await URLSession.shared.data(from: url)
                            guard let http = response as? HTTPURLResponse,
                                  http.statusCode == 200,
                                  let img = UIImage(data: data) else {
                                failed = true
                                return
                            }
                            ImageCache.shared.set(img, data: data, for: url)
                            image = img
                        } catch {
                            failed = true
                        }
                    }
                }
        }
    }
}

// MARK: - Image Cache (Memory + Disk)

final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()

    private let memory = NSCache<NSString, UIImage>()
    private let cacheDir: URL

    private init() {
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("chain-logos", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        cacheDir = dir
        memory.countLimit = 50
    }

    func get(for url: URL) -> UIImage? {
        let key = cacheKey(for: url)

        // Memory
        if let img = memory.object(forKey: key as NSString) {
            return img
        }

        // Disk
        let file = cacheDir.appendingPathComponent(key)
        guard let data = try? Data(contentsOf: file),
              let img = UIImage(data: data) else { return nil }

        memory.setObject(img, forKey: key as NSString)
        return img
    }

    func set(_ image: UIImage, data: Data, for url: URL) {
        let key = cacheKey(for: url)
        memory.setObject(image, forKey: key as NSString)
        let file = cacheDir.appendingPathComponent(key)
        try? data.write(to: file)
    }

    private func cacheKey(for url: URL) -> String {
        url.lastPathComponent.replacingOccurrences(of: "/", with: "_")
    }
}
