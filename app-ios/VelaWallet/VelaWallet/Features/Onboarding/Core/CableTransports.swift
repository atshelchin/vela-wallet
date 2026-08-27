//
//  CableTransports.swift
//  VelaWallet
//
//  The two caBLE data channels, as one message-oriented connection — a port of
//  the founder's proven demo (apppasskeysdemo-ios/CableConn.swift). Everything
//  the frames MEAN (Noise, the transport cipher, CTAP) lives in vela-core
//  behind CableFramePort; these classes move bytes and nothing else.
//
//   - L2capCableConn     — CTAP 2.3 local BLE (L2CAP CoC), 4-byte big-endian
//     length prefix per message. No tunnel server, no internet.
//   - WebSocketCableConn — CTAP 2.2 WebSocket tunnel, one binary WS frame per
//     message, subprotocol fido.cable.
//
//  Everything lives on the MainActor: the L2CAP streams are scheduled on
//  RunLoop.main and the URLSession delegate queue is .main, so all callbacks
//  land on the main thread — one serialization domain for the read buffer and
//  the continuation queue. The Rust ceremony runs on a BACKGROUND thread and
//  its CableFramePort calls are synchronous; CableConnPort bridges the two
//  worlds with a semaphore per call (safe precisely because the ceremony
//  thread is never the main thread — the SmartCard path set that precedent).
//

import Foundation
import CoreBluetooth
import VelaCore

nonisolated enum CableConnError: Error, CustomStringConvertible {
    case closed
    case badLength(Int)
    case connectFailed(String)
    case timeout
    var description: String {
        switch self {
        case .closed: return "the channel closed"
        case let .badLength(n): return "bad frame length \(n)"
        case let .connectFailed(m): return "connect failed: \(m)"
        case .timeout: return "timed out"
        }
    }
}

@MainActor
protocol CableConn: AnyObject {
    var channel: String { get }
    func writeFrame(_ bytes: Data) throws
    func readFrame() async throws -> Data
    func close()
}

/// A [CableConn] as the Rust core's frame port. The core calls these from its
/// blocking ceremony thread; each call hops to the MainActor and blocks on a
/// semaphore until the actor answers.
final class CableConnPort: CableFramePort, @unchecked Sendable {
    private let conn: CableConn
    private let name: String

    @MainActor
    init(_ conn: CableConn) {
        self.conn = conn
        self.name = conn.channel
    }

    func writeFrame(frame: Data) -> String? {
        let semaphore = DispatchSemaphore(value: 0)
        var failure: String?
        Task { @MainActor [conn] in
            do { try conn.writeFrame(frame) } catch { failure = "\(error)" }
            semaphore.signal()
        }
        semaphore.wait()
        return failure
    }

    func readFrame() -> CableFrameOutcome {
        let semaphore = DispatchSemaphore(value: 0)
        var outcome: CableFrameOutcome = .timedOut
        Task { @MainActor [conn] in
            do { outcome = .frame(bytes: try await conn.readFrame()) } catch CableConnError.timeout {
                outcome = .timedOut
            } catch {
                outcome = .failed(detail: "\(error)")
            }
            semaphore.signal()
        }
        semaphore.wait()
        return outcome
    }

    func channel() -> String { name }

    func close() {
        let semaphore = DispatchSemaphore(value: 0)
        Task { @MainActor [conn] in
            conn.close()
            semaphore.signal()
        }
        semaphore.wait()
    }
}

/// BLE L2CAP CoC. Each message = 4-byte big-endian length prefix + payload
/// (the same framing every other Vela client speaks on this channel).
@MainActor
final class L2capCableConn: NSObject, CableConn {
    nonisolated let channel = "L2CAP"

    private let input: InputStream
    private let output: OutputStream
    private var rxBuffer = Data()
    private var pendingReads: [CheckedContinuation<Data, Error>] = []
    private var writeQueue = Data()
    private var closed = false

    private static let maxFrame = 1 << 20

    init(_ ch: CBL2CAPChannel) {
        self.input = ch.inputStream
        self.output = ch.outputStream
        super.init()
        for s in [input, output] {
            s.delegate = self
            s.schedule(in: .main, forMode: .default)
            s.open()
        }
    }

    func writeFrame(_ bytes: Data) throws {
        guard !closed else { throw CableConnError.closed }
        var header = Data(count: 4)
        let n = UInt32(bytes.count)
        header[0] = UInt8((n >> 24) & 0xff)
        header[1] = UInt8((n >> 16) & 0xff)
        header[2] = UInt8((n >> 8) & 0xff)
        header[3] = UInt8(n & 0xff)
        writeQueue.append(header)
        writeQueue.append(bytes)
        pumpWrite()
    }

    func readFrame() async throws -> Data {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Data, Error>) in
            if closed { cont.resume(throwing: CableConnError.closed); return }
            pendingReads.append(cont)
            drainFrames()
        }
    }

    private func handleEvent(_ e: Stream.Event) {
        switch e {
        case .hasBytesAvailable:
            var tmp = [UInt8](repeating: 0, count: 4096)
            let read = input.read(&tmp, maxLength: tmp.count)
            if read > 0 { rxBuffer.append(contentsOf: tmp[0..<read]); drainFrames() }
            else if read < 0 { fail(CableConnError.closed) }
        case .hasSpaceAvailable:
            pumpWrite()
        case .errorOccurred, .endEncountered:
            fail(CableConnError.closed)
        default:
            break
        }
    }

    private func drainFrames() {
        while !pendingReads.isEmpty, rxBuffer.count >= 4 {
            let b = [UInt8](rxBuffer.prefix(4))
            let len = (Int(b[0]) << 24) | (Int(b[1]) << 16) | (Int(b[2]) << 8) | Int(b[3])
            guard len >= 0, len <= Self.maxFrame else { fail(CableConnError.badLength(len)); return }
            guard rxBuffer.count >= 4 + len else { break }
            let payload = Data(rxBuffer.subdata(in: 4..<(4 + len)))
            rxBuffer.removeSubrange(0..<(4 + len))
            pendingReads.removeFirst().resume(returning: payload)
        }
    }

    private func pumpWrite() {
        // Attempt the write directly rather than gating on hasSpaceAvailable:
        // that property can report false when a write would succeed, and the
        // one-shot event fired right after open() is wasted if the queue was
        // still empty then. 0 (buffer full) or <0 (not open yet) leaves the
        // bytes queued for the next .hasSpaceAvailable event.
        while !writeQueue.isEmpty {
            let n = writeQueue.count
            let wrote = writeQueue.withUnsafeBytes { raw -> Int in
                guard let base = raw.bindMemory(to: UInt8.self).baseAddress else { return 0 }
                return output.write(base, maxLength: n)
            }
            if wrote > 0 { writeQueue.removeSubrange(0..<wrote) } else { break }
        }
    }

    private func fail(_ err: Error) {
        guard !closed else { return }
        closed = true
        let waiting = pendingReads
        pendingReads.removeAll()
        for c in waiting { c.resume(throwing: err) }
    }

    func close() {
        guard !closed else { return }
        closed = true
        for s in [input, output] {
            s.close()
            s.remove(from: .main, forMode: .default)
        }
        let waiting = pendingReads
        pendingReads.removeAll()
        for c in waiting { c.resume(throwing: CableConnError.closed) }
    }
}

extension L2capCableConn: StreamDelegate {
    // Streams are scheduled on RunLoop.main → this always fires on the main thread.
    nonisolated func stream(_ s: Stream, handle e: Stream.Event) {
        MainActor.assumeIsolated { self.handleEvent(e) }
    }
}

/// WebSocket tunnel: one binary WS frame per message, subprotocol fido.cable.
@MainActor
final class WebSocketCableConn: NSObject, CableConn {
    nonisolated let channel = "WebSocket"
    private var task: URLSessionWebSocketTask!
    private var session: URLSession!
    private var openCont: CheckedContinuation<Void, Error>?
    private var sendError: Error?

    static let subprotocol = "fido.cable"

    static func connect(url: URL, timeoutMs: Int) async throws -> WebSocketCableConn {
        let c = WebSocketCableConn()
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = TimeInterval(timeoutMs) / 1000
        // delegateQueue = .main so the delegate callbacks land on the MainActor.
        c.session = URLSession(configuration: cfg, delegate: c, delegateQueue: .main)
        c.task = c.session.webSocketTask(with: url, protocols: [subprotocol])

        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { @MainActor in
                try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
                    c.openCont = cont
                    c.task.resume()
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeoutMs) * 1_000_000)
                throw CableConnError.timeout
            }
            try await group.next()
            group.cancelAll()
        }
        return c
    }

    func writeFrame(_ bytes: Data) throws {
        if let e = sendError { throw e }
        task.send(.data(bytes)) { [weak self] error in
            guard let error else { return }
            // completion runs on the .main delegate queue → main thread.
            MainActor.assumeIsolated { self?.sendError = error }
        }
    }

    func readFrame() async throws -> Data {
        if let e = sendError { throw e }
        switch try await task.receive() {
        case let .data(d): return d
        case .string: throw CableConnError.closed // text frames illegal on the tunnel
        @unknown default: throw CableConnError.closed
        }
    }

    func close() {
        task?.cancel(with: .normalClosure, reason: nil)
        session?.invalidateAndCancel()
    }
}

extension WebSocketCableConn: URLSessionWebSocketDelegate {
    nonisolated func urlSession(_ s: URLSession, webSocketTask t: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
        MainActor.assumeIsolated { self.openCont?.resume(); self.openCont = nil }
    }

    nonisolated func urlSession(_ s: URLSession, task t: URLSessionTask, didCompleteWithError error: Error?) {
        MainActor.assumeIsolated {
            if let e = error, let cont = self.openCont { self.openCont = nil; cont.resume(throwing: e) }
        }
    }
}
