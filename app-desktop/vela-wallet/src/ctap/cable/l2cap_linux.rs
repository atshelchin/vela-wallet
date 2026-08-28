//! The CTAP 2.3 BLE-only data channel on Linux: an L2CAP LE credit-based
//! connection-oriented channel to the authenticator, over a BlueZ socket. No
//! tunnel server, no relay, no internet — same story as the macOS `l2cap`
//! module, different plumbing: where macOS goes through CoreBluetooth's
//! `CBL2CAPChannel`, Linux opens `AF_BLUETOOTH`/`BTPROTO_L2CAP` directly (the
//! kernel exposes LE CoC to user space; this is the one desktop where the
//! Bluetooth stack is simply a socket away).
//!
//! The scan (btleplug over BlueZ) already found the peripheral and read the PSM
//! from its advert suffix; it also recorded the device's public/random address,
//! which the socket's `sockaddr_l2` needs verbatim — an LE connect to the right
//! MAC with the wrong address TYPE simply times out.
//!
//! Framing stays the shared 4-byte big-endian length prefix. The socket is
//! `SOCK_SEQPACKET` (the kernel requires it for LE CoC) and each `send` is one
//! SDU, but the reader treats arrivals as a byte stream and reassembles by the
//! prefix — the peer's writes may be chunked by its own MTU, and the prefix,
//! not the SDU boundary, is the protocol's word for "one message".
//!
//! DEVICE-GATED: compiled on Linux, but the connect/MTU timing can only be
//! confirmed against a real BLE authenticator on real hardware.

use std::io;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::time::Duration;

use vela_core::cable::conn::CablePort;
use vela_core::ctap::hid_cable::PortError;

use super::HybridError;

/// `AF_BLUETOOTH` — not in libc's portable surface under that name everywhere,
/// so pinned to the kernel's value.
const AF_BLUETOOTH: libc::c_int = 31;
const BTPROTO_L2CAP: libc::c_int = 0;

/// `sockaddr_l2.l2_bdaddr_type` — the LE address namespaces.
const BDADDR_LE_PUBLIC: u8 = 0x01;
const BDADDR_LE_RANDOM: u8 = 0x02;

/// How long the LE connect itself may take, matching the macOS module's
/// per-step budget. `SO_RCVTIMEO` does NOT cover `connect(2)`, so without this
/// the blocking connect sits on the kernel's own LE timeout while the sign-in
/// screen shows nothing — and a phone that advertised a PSM but will not accept
/// the channel is exactly the case that has to fail fast enough to fall back to
/// the tunnel.
const CONNECT_TIMEOUT: Duration = Duration::from_secs(20);

/// How long a single frame's read may take before the peer is called dead —
/// the same budget as the macOS module and the WebSocket tunnel (a person is
/// approving on their phone inside it).
const IO_TIMEOUT: Duration = Duration::from_secs(130);

/// The most a single frame may claim, so a corrupt length prefix cannot ask us
/// to allocate the world. caBLE messages are small.
const MAX_FRAME: usize = 1 << 20;

/// One receive buffer, sized past any LE CoC MTU so `SOCK_SEQPACKET` never
/// truncates an SDU.
const RECV_CHUNK: usize = 65535;

/// `struct sockaddr_l2` from `bluetooth/l2cap.h`. The kernel reads `l2_psm` and
/// `l2_cid` little-endian (`__le16`), and `l2_bdaddr` LSB-first — the REVERSE
/// of the human "AA:BB:CC:DD:EE:FF" order btleplug reports.
#[repr(C)]
#[derive(Clone, Copy)]
struct SockaddrL2 {
    l2_family: libc::sa_family_t,
    l2_psm: u16,
    l2_bdaddr: [u8; 6],
    l2_cid: u16,
    l2_bdaddr_type: u8,
}

/// `connect(2)` to `remote`, bounded by `timeout`.
///
/// The socket goes non-blocking for the call and is restored after, so the rest
/// of the port — written throughout against a blocking socket whose reads are
/// bounded by `SO_RCVTIMEO` — sees the socket it expects. A connect that is
/// still in flight reports POLLOUT either way, so the real answer is read back
/// out of `SO_ERROR` rather than inferred from the poll.
fn connect_within(fd: &OwnedFd, remote: &SockaddrL2, timeout: Duration) -> io::Result<()> {
    let raw = fd.as_raw_fd();
    let flags = unsafe { libc::fcntl(raw, libc::F_GETFL) };
    if flags < 0 {
        return Err(io::Error::last_os_error());
    }
    if unsafe { libc::fcntl(raw, libc::F_SETFL, flags | libc::O_NONBLOCK) } < 0 {
        return Err(io::Error::last_os_error());
    }
    let restore = |result: io::Result<()>| {
        unsafe { libc::fcntl(raw, libc::F_SETFL, flags) };
        result
    };

    let started = unsafe {
        libc::connect(
            raw,
            (remote as *const SockaddrL2).cast(),
            std::mem::size_of::<SockaddrL2>() as libc::socklen_t,
        )
    };
    if started == 0 {
        return restore(Ok(()));
    }
    let error = io::Error::last_os_error();
    if error.raw_os_error() != Some(libc::EINPROGRESS) {
        return restore(Err(error));
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_possible_wrap)]
    let millis = timeout.as_millis() as libc::c_int;
    let mut watch = libc::pollfd {
        fd: raw,
        events: libc::POLLOUT,
        revents: 0,
    };
    let ready = unsafe { libc::poll(std::ptr::addr_of_mut!(watch), 1, millis) };
    if ready < 0 {
        return restore(Err(io::Error::last_os_error()));
    }
    if ready == 0 {
        return restore(Err(io::Error::new(
            io::ErrorKind::TimedOut,
            "the authenticator did not accept the channel",
        )));
    }

    let mut pending: libc::c_int = 0;
    let mut len = std::mem::size_of::<libc::c_int>() as libc::socklen_t;
    let read_back = unsafe {
        libc::getsockopt(
            raw,
            libc::SOL_SOCKET,
            libc::SO_ERROR,
            std::ptr::addr_of_mut!(pending).cast(),
            std::ptr::addr_of_mut!(len),
        )
    };
    if read_back < 0 {
        return restore(Err(io::Error::last_os_error()));
    }
    if pending != 0 {
        return restore(Err(io::Error::from_raw_os_error(pending)));
    }
    restore(Ok(()))
}

/// One L2CAP CoC to a caBLE authenticator, as the core's [`CablePort`].
pub struct L2capCablePort {
    fd: OwnedFd,
    /// Bytes received but not yet claimed by a frame — SDU boundaries and
    /// frame boundaries are independent.
    pending: Vec<u8>,
}

impl L2capCablePort {
    /// Connect the LE CoC to `psm` on the peripheral at `address` (btleplug's
    /// big-endian display order), whose LE address namespace is `random`.
    pub fn connect(address: [u8; 6], random: bool, psm: u16) -> Result<Self, HybridError> {
        let raw = unsafe { libc::socket(AF_BLUETOOTH, libc::SOCK_SEQPACKET, BTPROTO_L2CAP) };
        if raw < 0 {
            return Err(HybridError::Bluetooth(format!(
                "L2CAP socket: {}",
                io::Error::last_os_error()
            )));
        }
        let fd = unsafe { OwnedFd::from_raw_fd(raw) };

        // Bind the source half: any local adapter, PUBLIC namespace (the
        // adapter's own identity address). Skipping the bind makes some kernels
        // pick a BR/EDR source and refuse the LE connect.
        #[allow(clippy::cast_possible_truncation)]
        let mut local: SockaddrL2 = unsafe { std::mem::zeroed() };
        local.l2_family = AF_BLUETOOTH as libc::sa_family_t;
        local.l2_bdaddr_type = BDADDR_LE_PUBLIC;
        let bound = unsafe {
            libc::bind(
                fd.as_raw_fd(),
                std::ptr::addr_of!(local).cast(),
                std::mem::size_of::<SockaddrL2>() as libc::socklen_t,
            )
        };
        if bound < 0 {
            return Err(HybridError::Bluetooth(format!(
                "L2CAP bind: {}",
                io::Error::last_os_error()
            )));
        }

        // Reads must not hang past the ceremony budget.
        let timeout = libc::timeval {
            tv_sec: IO_TIMEOUT.as_secs() as libc::time_t,
            tv_usec: 0,
        };
        unsafe {
            libc::setsockopt(
                fd.as_raw_fd(),
                libc::SOL_SOCKET,
                libc::SO_RCVTIMEO,
                std::ptr::addr_of!(timeout).cast(),
                std::mem::size_of::<libc::timeval>() as libc::socklen_t,
            );
        }

        // Destination: the advertised PSM on the scanned device's LE address,
        // in the kernel's byte orders (little-endian PSM, LSB-first bdaddr).
        let mut bdaddr = address;
        bdaddr.reverse();
        #[allow(clippy::cast_possible_truncation)]
        let mut remote: SockaddrL2 = unsafe { std::mem::zeroed() };
        remote.l2_family = AF_BLUETOOTH as libc::sa_family_t;
        remote.l2_psm = psm.to_le();
        remote.l2_bdaddr = bdaddr;
        remote.l2_bdaddr_type = if random {
            BDADDR_LE_RANDOM
        } else {
            BDADDR_LE_PUBLIC
        };
        connect_within(&fd, &remote, CONNECT_TIMEOUT).map_err(|error| {
            HybridError::Bluetooth(format!("L2CAP connect (PSM {psm}): {error}"))
        })?;

        Ok(Self {
            fd,
            pending: Vec::new(),
        })
    }

    /// Receive at least one more SDU into the pending buffer.
    fn fill(&mut self) -> Result<(), PortError> {
        let mut chunk = vec![0u8; RECV_CHUNK];
        let got = unsafe {
            libc::recv(
                self.fd.as_raw_fd(),
                chunk.as_mut_ptr().cast(),
                chunk.len(),
                0,
            )
        };
        if got == 0 {
            return Err(PortError::Io("L2CAP channel closed".to_owned()));
        }
        if got < 0 {
            let error = io::Error::last_os_error();
            if matches!(
                error.kind(),
                io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
            ) {
                return Err(PortError::TimedOut);
            }
            return Err(PortError::Io(format!("L2CAP read: {error}")));
        }
        #[allow(clippy::cast_sign_loss)]
        self.pending.extend_from_slice(&chunk[..got as usize]);
        Ok(())
    }
}

impl CablePort for L2capCablePort {
    fn write_frame(&mut self, frame: &[u8]) -> Result<(), PortError> {
        // Prefix and payload in ONE send: one frame, one SDU, and the peer's
        // stream-reader never sees a torn prefix.
        #[allow(clippy::cast_possible_truncation)]
        let len = frame.len() as u32;
        let mut framed = Vec::with_capacity(frame.len() + 4);
        framed.extend_from_slice(&len.to_be_bytes());
        framed.extend_from_slice(frame);
        let sent =
            unsafe { libc::send(self.fd.as_raw_fd(), framed.as_ptr().cast(), framed.len(), 0) };
        if sent < 0 {
            return Err(PortError::Io(format!(
                "L2CAP write: {}",
                io::Error::last_os_error()
            )));
        }
        #[allow(clippy::cast_sign_loss)]
        if (sent as usize) != framed.len() {
            return Err(PortError::Io("L2CAP short write".to_owned()));
        }
        Ok(())
    }

    fn read_frame(&mut self) -> Result<Vec<u8>, PortError> {
        loop {
            if self.pending.len() >= 4 {
                let mut header = [0u8; 4];
                header.copy_from_slice(&self.pending[..4]);
                let len = u32::from_be_bytes(header) as usize;
                if len > MAX_FRAME {
                    return Err(PortError::Io(format!("L2CAP frame too large: {len}")));
                }
                if self.pending.len() >= 4 + len {
                    let frame = self.pending[4..4 + len].to_vec();
                    self.pending.drain(..4 + len);
                    return Ok(frame);
                }
            }
            self.fill()?;
        }
    }

    fn channel(&self) -> &str {
        "L2CAP"
    }
}
