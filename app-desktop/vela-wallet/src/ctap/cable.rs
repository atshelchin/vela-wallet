//! The caBLE / hybrid transport — "sign in with your phone" — and nothing else.
//!
//! Everything about the PROTOCOL — the QR payload, the BLE advert decrypt, the
//! Noise handshake, the CTAP-over-Noise framing — lives in [`vela_core::cable`],
//! where the other clients reach it too. What lives here is the part made of
//! platform: scanning the Bluetooth radio for the responder's proximity advert,
//! and opening the WebSocket tunnel. A connected [`WebSocketCablePort`] is a
//! [`CablePort`]; wrapping it with [`CableInitiator::establish`] yields a
//! [`vela_core::ctap::ceremony::Cable`] the shared ceremony drives, exactly like
//! the USB cable.
//!
//! ## Why the WebSocket is blocking and the scan is async
//!
//! This shell runs a ceremony on a blocking background thread (see `usb.rs`), so
//! the tunnel is a blocking [`tungstenite`] socket — no runtime for the socket
//! itself. The BLE scan is one-shot and `btleplug` is async-only, so a small
//! current-thread [`tokio`] runtime drives JUST the scan: the advert bytes come
//! back and the runtime is done, before the blocking socket is ever opened.

use std::net::TcpStream;
use std::time::Duration;

use btleplug::api::{Central, CentralEvent, Manager as _, ScanFilter};
use btleplug::platform::Manager;
use futures::StreamExt;
use tungstenite::client::IntoClientRequest;
use tungstenite::http::HeaderValue;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};
use uuid::Uuid;

use vela_core::cable::conn::{CableConnection, CablePort};
use vela_core::cable::crypto as cable_crypto;
use vela_core::cable::session::CableInitiator;
use vela_core::ctap::ceremony::TouchAnnouncer;
use vela_core::ctap::hid_cable::PortError;

/// What can go wrong standing a hybrid connection up, BEFORE the `Cable` exists.
/// Once the handshake runs, failures are the core's `CableError`.
#[derive(Debug)]
pub enum HybridError {
    /// The scan window elapsed with no matching advert — the phone never showed,
    /// or its Bluetooth is off, or it scanned a different QR.
    NoAdvert,
    /// The Bluetooth adapter itself is missing or unavailable.
    Bluetooth(String),
    /// The advert decrypted but is malformed, or names an unknown tunnel domain.
    BadAdvert,
    /// The WebSocket tunnel would not open (connect, TLS, or handshake).
    Tunnel(String),
    /// The Noise handshake over the tunnel failed.
    Handshake(String),
}

impl std::fmt::Display for HybridError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoAdvert => write!(f, "no phone answered the QR within the scan window"),
            Self::Bluetooth(detail) => write!(f, "Bluetooth is unavailable: {detail}"),
            Self::BadAdvert => write!(f, "the phone's advertisement was malformed"),
            Self::Tunnel(detail) => write!(f, "the relay tunnel would not open: {detail}"),
            Self::Handshake(detail) => write!(f, "the encrypted channel failed: {detail}"),
        }
    }
}

/// The two 16-bit BLE service-data UUIDs a caBLE responder advertises under
/// (CTAP 2.2 used `0xFFF9`; 2.3 moved to `0xFDE2`). A scanner watches both.
const SERVICE_UUIDS: [Uuid; 2] = [
    Uuid::from_u128(0x0000_fff9_0000_1000_8000_00805f9b34fb),
    Uuid::from_u128(0x0000_fde2_0000_1000_8000_00805f9b34fb),
];

/// The WebSocket subprotocol the tunnel server requires.
const CABLE_SUBPROTOCOL: &str = "fido.cable";

/// How long to scan before giving up. A person has to pick up their phone,
/// unlock it, and approve the prompt that scanning the QR raised.
const SCAN_TIMEOUT: Duration = Duration::from_secs(90);

/// A read blocks this long before the tunnel is declared dead — long enough to
/// cover the person approving on their phone (the CTAP user-presence budget and
/// then some), short enough that a dropped tunnel does not hang forever.
const TUNNEL_READ_TIMEOUT: Duration = Duration::from_secs(130);

/// The CTAP 2.2 WebSocket tunnel, as the core's [`CablePort`]: one binary frame
/// per message.
pub struct WebSocketCablePort {
    ws: WebSocket<MaybeTlsStream<TcpStream>>,
}

impl WebSocketCablePort {
    /// Open the tunnel at `url` (`wss://…/cable/connect/<routing>/<tunnel>`),
    /// negotiating the `fido.cable` subprotocol.
    pub fn connect(url: &str) -> Result<Self, HybridError> {
        let mut request = url
            .into_client_request()
            .map_err(|error| HybridError::Tunnel(error.to_string()))?;
        request.headers_mut().insert(
            "Sec-WebSocket-Protocol",
            HeaderValue::from_static(CABLE_SUBPROTOCOL),
        );
        let (ws, _response) =
            tungstenite::connect(request).map_err(|error| HybridError::Tunnel(error.to_string()))?;

        // A bounded read so a phone that never answers frees the thread instead
        // of blocking it until the process exits. Best effort: a stream whose
        // inner socket cannot be reached just keeps the default (blocking) read.
        match ws.get_ref() {
            MaybeTlsStream::Plain(stream) => {
                let _ = stream.set_read_timeout(Some(TUNNEL_READ_TIMEOUT));
            }
            MaybeTlsStream::Rustls(stream) => {
                let _ = stream.get_ref().set_read_timeout(Some(TUNNEL_READ_TIMEOUT));
            }
            _ => {}
        }

        Ok(Self { ws })
    }
}

impl CablePort for WebSocketCablePort {
    fn write_frame(&mut self, frame: &[u8]) -> Result<(), PortError> {
        self.ws
            .send(Message::Binary(frame.to_vec().into()))
            .map_err(|error| PortError::Io(error.to_string()))
    }

    fn read_frame(&mut self) -> Result<Vec<u8>, PortError> {
        loop {
            match self.ws.read() {
                Ok(Message::Binary(bytes)) => return Ok(bytes.to_vec()),
                Ok(Message::Close(_)) => return Err(PortError::Io("the tunnel closed".to_owned())),
                // Ping/pong/text are tunnel housekeeping, not caBLE frames.
                Ok(_) => continue,
                Err(error) => return Err(PortError::Io(error.to_string())),
            }
        }
    }

    fn channel(&self) -> &str {
        "WebSocket"
    }
}

/// Run the whole hybrid handshake: scan for the phone this QR named, open the
/// tunnel it points at, and run the Noise handshake — returning the [`Cable`]
/// the ceremony drives.
///
/// [`Cable`]: vela_core::ctap::ceremony::Cable
///
/// The QR must already be on screen (the caller shows [`CableInitiator::qr_payload`]);
/// scanning it is what makes the phone start advertising, so nothing here can
/// happen until it is.
pub fn establish_hybrid(
    session: &CableInitiator,
    product: String,
    ephemeral_seed: &[u8],
    on_touch: Option<TouchAnnouncer>,
) -> Result<CableConnection<WebSocketCablePort>, HybridError> {
    // 1. Find the phone by its BLE proximity advert.
    log("scanning for the phone's Bluetooth advert…");
    let advert = scan_for_advert(session.eid_key())?;
    log("advert found; decrypted");

    // 2. The advert names the tunnel server and routing; build the URL.
    let url = session.connect_url(&advert).ok_or(HybridError::BadAdvert)?;
    log(&format!("opening tunnel: {url}"));

    // 3. Open the tunnel.
    let port = WebSocketCablePort::connect(&url)?;
    log("tunnel open; starting Noise handshake");

    // 4. Run the Noise handshake over it → a Cable.
    let result = session
        .establish(port, &advert, ephemeral_seed, product, on_touch)
        .map_err(|error| HybridError::Handshake(format!("{error:?}")));
    match &result {
        Ok(_) => log("handshake complete; channel is up"),
        Err(error) => log(&format!("handshake failed: {error}")),
    }
    result
}

/// One diagnostics line to stderr. The hybrid path has no `Host` in reach, and
/// its failures happen off-screen (a scan, a socket) where the login machine's
/// one generic "sign-in failed" body cannot say what broke — so the detail goes
/// here, visible when the app is launched from a terminal or Console.app.
fn log(line: &str) {
    eprintln!("[vela-cable] {line}");
}

/// Scan the Bluetooth radio for a proximity advert that decrypts under this
/// session's EID key, and return its 16-byte plaintext. Blocks (on a private
/// current-thread runtime) up to [`SCAN_TIMEOUT`].
fn scan_for_advert(eid_key: Vec<u8>) -> Result<[u8; 16], HybridError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_time()
        .build()
        .map_err(|error| HybridError::Bluetooth(error.to_string()))?;

    runtime.block_on(async move {
        match tokio::time::timeout(SCAN_TIMEOUT, scan_loop(&eid_key)).await {
            Ok(result) => result,
            Err(_elapsed) => Err(HybridError::NoAdvert),
        }
    })
}

/// The async half of the scan: watch service-data adverts, trial-decrypting the
/// first 20 bytes of each under the two caBLE service UUIDs.
async fn scan_loop(eid_key: &[u8]) -> Result<[u8; 16], HybridError> {
    let manager = Manager::new()
        .await
        .map_err(|error| HybridError::Bluetooth(error.to_string()))?;
    let adapter = manager
        .adapters()
        .await
        .map_err(|error| HybridError::Bluetooth(error.to_string()))?
        .into_iter()
        .next()
        .ok_or_else(|| HybridError::Bluetooth("no Bluetooth adapter".to_owned()))?;
    log("Bluetooth adapter opened");

    let mut events = adapter
        .events()
        .await
        .map_err(|error| HybridError::Bluetooth(error.to_string()))?;
    adapter
        .start_scan(ScanFilter::default())
        .await
        .map_err(|error| HybridError::Bluetooth(error.to_string()))?;
    log("scan started");

    let mut seen = 0u32;
    while let Some(event) = events.next().await {
        // The caBLE advert is service data under 0xFFF9 / 0xFDE2; log every
        // service-data event's UUIDs so a phone advertising under an unexpected
        // one (or not at all) is visible rather than a silent 90-second wait.
        let CentralEvent::ServiceDataAdvertisement { service_data, .. } = event else {
            continue;
        };
        seen += 1;
        if seen <= 40 {
            let uuids: Vec<String> = service_data.keys().map(|u| u.to_string()).collect();
            log(&format!("service-data advert #{seen}: {uuids:?}"));
        }
        for uuid in SERVICE_UUIDS {
            let Some(data) = service_data.get(&uuid) else {
                continue;
            };
            log(&format!("candidate under {uuid} ({} bytes)", data.len()));
            if data.len() < 20 {
                continue;
            }
            if let Some(plaintext) = cable_crypto::try_decrypt_advert(&data[0..20], eid_key) {
                let _ = adapter.stop_scan().await;
                return Ok(plaintext);
            }
            log("candidate did not decrypt under this QR's key");
        }
    }

    Err(HybridError::NoAdvert)
}
