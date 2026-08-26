//! Names for the authenticator models the compiled catalog cannot name.
//!
//! The catalog carries software passkey providers; hardware keys live in the
//! FIDO metadata service, hundreds of models deep, which is what the directory
//! service answers for. It is OUR service and stores nothing (founder,
//! 2026-08-26) — and the catalog still answers first, instantly and offline, so
//! this only ever runs for a key nothing on the machine could name.
//!
//! This platform is where it matters most: the desktop is the one client whose
//! keys are usually hardware.
//!
//! `vela_core::passkey` owns the contract — which AAGUIDs are worth asking
//! about, and what counts as an answer. This owns the transport and the memory.
//! A failure is remembered as "no answer" rather than retried on every frame.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use gpui::RenderImage;

use crate::raster::render_image_from_png;

/// A key list must never wait on a name.
const TIMEOUT: Duration = Duration::from_secs(6);

/// What the directory said, in this app's own vocabulary.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Holder {
    pub name: String,
    pub icon_url: Option<String>,
}

#[derive(Default)]
pub struct PasskeyDirectory {
    /// `None` means asked with nothing to show for it.
    entries: HashMap<String, Option<Holder>>,
    marks: HashMap<String, Option<Arc<RenderImage>>>,
    asking: HashMap<String, ()>,
}

impl PasskeyDirectory {
    /// The settled answer for `aaguid`, or `None` while there is none.
    pub fn holder(&self, aaguid: &str, dark: bool) -> Option<&Holder> {
        self.entries.get(&key(aaguid, dark))?.as_ref()
    }

    /// The settled mark for `url` at `size`, or `None` while there is none.
    pub fn mark(&self, url: &str, size: u32) -> Option<Arc<RenderImage>> {
        self.marks.get(&format!("{url}@{size}"))?.clone()
    }

    /// Has anyone already asked this question? Callers use it to spawn once.
    pub fn claim(&mut self, id: String) -> bool {
        if self.entries.contains_key(&id) || self.asking.contains_key(&id) {
            return false;
        }
        self.asking.insert(id, ());
        true
    }

    pub fn settle(&mut self, aaguid: &str, dark: bool, holder: Option<Holder>) {
        let id = key(aaguid, dark);
        self.asking.remove(&id);
        self.entries.insert(id, holder);
    }

    pub fn claim_mark(&mut self, url: &str, size: u32) -> bool {
        let id = format!("{url}@{size}");
        if self.marks.contains_key(&id) || self.asking.contains_key(&id) {
            return false;
        }
        self.asking.insert(id, ());
        true
    }

    pub fn settle_mark(&mut self, url: &str, size: u32, image: Option<Arc<RenderImage>>) {
        let id = format!("{url}@{size}");
        self.asking.remove(&id);
        self.marks.insert(id, image);
    }
}

fn key(aaguid: &str, dark: bool) -> String {
    format!("{}|{dark}", aaguid.to_ascii_lowercase())
}

/// Ask the directory about `aaguid`. Blocking; callers run it off the UI thread.
#[must_use]
pub fn fetch_holder(aaguid: &str, dark: bool) -> Option<Holder> {
    let url = vela_core::passkey::directory_lookup_url(aaguid)?;
    let json = fetch(&url)?;
    let body = String::from_utf8(json).ok()?;
    vela_core::passkey::directory_entry(aaguid, &body, dark).map(|entry| Holder {
        name: entry.name,
        icon_url: entry.icon_url,
    })
}

/// Fetch and decode a directory mark. Blocking; callers run it off the UI thread.
///
/// The service serves both: a PNG decodes directly, an SVG goes through the same
/// rasterizer every other piece of core artwork uses.
#[must_use]
pub fn fetch_mark(url: &str, size: u32) -> Option<Arc<RenderImage>> {
    let bytes = fetch(url)?;
    if let Some(image) = render_image_from_png(&bytes) {
        return Some(image);
    }
    let svg = String::from_utf8(bytes).ok()?;
    let png = vela_core::rasterize_svg_png(&svg, size).ok()?;
    render_image_from_png(&png)
}

fn fetch(url: &str) -> Option<Vec<u8>> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(TIMEOUT))
        .build()
        .into();
    let mut response = agent.get(url).call().ok()?;
    let mut body = Vec::new();
    std::io::Read::read_to_end(&mut response.body_mut().as_reader(), &mut body).ok()?;
    Some(body)
}
