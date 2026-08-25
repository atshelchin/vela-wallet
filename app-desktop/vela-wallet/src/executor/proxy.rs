//! Where the registry client learns how to get out of the machine.
//!
//! Two things go wrong on a desktop that `ureq`'s own proxy handling does not
//! cover, and both of them present identically: every registry call sits until
//! its budget elapses and the flow ends on a timeout sheet blaming the index
//! service, while the person's browser loads the same host fine.
//!
//! ## 1. A SOCKS5 proxy is asked to connect to an address we cannot look up
//!
//! `ureq` maps `socks://` and `socks5://` to [`ProxyProtocol::Socks5`], whose
//! `resolve_target` default is `true` — the target hostname is resolved
//! LOCALLY and only the resulting address is handed to the proxy. That is a
//! fine default for a proxy that exists to change the route. It is exactly
//! wrong for the proxy this application actually meets, which exists because
//! name resolution on the machine does not work: the local lookup is precisely
//! the step that cannot succeed, so the request never even reaches the SOCKS
//! handshake. `curl` spells the working variant `socks5h`, browsers do it by
//! default, and there is no case where this app wants the other one — so a
//! SOCKS5 proxy is switched to resolving at the far end. It also stops the
//! lookup leaking around a proxy that was configured to carry it.
//!
//! Note the environment does not have to name `socks` for this to bite:
//! `ureq` reads `ALL_PROXY` BEFORE `HTTPS_PROXY`, so a session exporting both
//! — which is what every proxy tool's setup snippet emits — gets the SOCKS one.
//!
//! ## 2. A desktop launch has no proxy environment at all
//!
//! `ureq` finds a proxy in `ALL_PROXY` / `HTTPS_PROXY` / `HTTP_PROXY`. That is
//! right for a CLI, which is started from a shell that has them, and wrong for
//! a desktop application: `Exec=vela-wallet` in the .desktop file inherits the
//! systemd user environment, and a proxy exported from `~/.bashrc` is not in
//! it. So when the environment says nothing, the desktop's own setting is read
//! — the one the browser obeys.
//!
//! ### Per platform
//!
//! * **Linux** — GNOME's `org.gnome.system.proxy`, through `gsettings`. It is
//!   the setting the GNOME/GTK network stack itself uses, so honouring it makes
//!   this app agree with the rest of the session. Read once per process: the
//!   value cannot change mid-flight in any way worth a subprocess per request.
//! * **Windows** — `ureq`'s own `win-system-proxy` feature reads the WinINET
//!   registry keys inside `Proxy::try_from_env()`. Nothing to do here.
//! * **macOS** — nothing. A system proxy there is installed into the network
//!   stack, so a direct connect already goes through it.
//!
//! What is deliberately NOT handled: `mode = 'auto'` (a PAC URL is a JavaScript
//! program, and running one to reach the key registry is not a trade this app
//! makes) and KDE's `kioslaverc`. Both fall through to no proxy, which is the
//! behaviour before this module existed.

use std::sync::OnceLock;

use ureq::{Proxy, ProxyProtocol};

/// The proxy to configure on an agent, or `None` to leave `ureq`'s own default
/// in place.
///
/// `None` is the answer whenever the environment already names a proxy that
/// will work as configured — `ureq`'s default config holds it, and replacing
/// it with our own copy would only risk dropping the `NO_PROXY` list it parsed.
pub fn system_proxy() -> Option<&'static Proxy> {
    static PROXY: OnceLock<Option<Proxy>> = OnceLock::new();
    PROXY
        .get_or_init(|| match Proxy::try_from_env() {
            // The environment is the more specific statement and is left to
            // stand — except for the one detail it cannot express, above.
            // On Windows this call also consults the registry (the
            // `win-system-proxy` feature), which is that platform's whole
            // system-proxy story.
            Some(from_env) => resolve_at_the_proxy(&from_env),
            None => desktop_proxy(),
        })
        .as_ref()
}

/// The same proxy, with the target hostname resolved at the far end.
///
/// `None` when there is nothing to change: an HTTP `CONNECT` proxy already
/// resolves remotely, and so does `socks4a` / `socks5h`, where the person
/// spelled the intent out. SOCKS4 is left alone as well — the protocol has no
/// way to carry a hostname, so "resolve remotely" is not a thing a SOCKS4
/// server can be asked for, and forcing it would trade a slow failure for an
/// immediate one.
fn resolve_at_the_proxy(proxy: &Proxy) -> Option<Proxy> {
    if proxy.protocol() != ProxyProtocol::Socks5 || !proxy.resolve_target() {
        return None;
    }

    // Rebuilt rather than mutated: `Proxy` is immutable, and `resolve_target`
    // is the single flag both connectors read (`socks.rs`, `connect.rs`), so
    // carrying everything else across verbatim is the whole job.
    let mut builder = Proxy::builder(ProxyProtocol::Socks5)
        .host(proxy.host())
        .port(proxy.port())
        .resolve_target(false);
    if let Some(username) = proxy.username() {
        builder = builder.username(username);
        if let Some(password) = proxy.password() {
            builder = builder.password(password);
        }
    }
    // `Proxy` can answer `is_no_proxy` but cannot list its entries, so the
    // bypass list is re-read from where `ureq` read it. Losing it would send a
    // localhost endpoint — which is what a self-hosted registry looks like —
    // out through the proxy and back, if it came back at all.
    for entry in no_proxy_from_env() {
        builder = builder.no_proxy(&entry);
    }

    builder.build().ok()
}

/// `NO_PROXY` / `no_proxy`, split the way `ureq` splits it.
fn no_proxy_from_env() -> Vec<String> {
    ["NO_PROXY", "no_proxy"]
        .into_iter()
        .find_map(|name| std::env::var(name).ok())
        .map(|value| {
            value
                .split(',')
                .map(|entry| entry.trim().to_owned())
                .filter(|entry| !entry.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(not(target_os = "linux"))]
fn desktop_proxy() -> Option<Proxy> {
    None
}

/// GNOME's proxy setting, as a `ureq::Proxy`.
#[cfg(target_os = "linux")]
fn desktop_proxy() -> Option<Proxy> {
    if gsettings("org.gnome.system.proxy", "mode")? != "manual" {
        return None;
    }

    // HTTPS first: every URL this client builds is https, and a session that
    // configures the two differently means the https one. `socks` is the last
    // resort rather than the first because an HTTP CONNECT proxy is what the
    // http/https keys describe, and reading a socks port as one would produce a
    // connection that fails in a way nothing here could explain.
    let (scheme, host, port) = ["https", "http", "socks"]
        .into_iter()
        .find_map(|scheme| {
            let host = gsettings(&format!("org.gnome.system.proxy.{scheme}"), "host")?;
            let port: u16 = gsettings(&format!("org.gnome.system.proxy.{scheme}"), "port")?
                .parse()
                .ok()?;
            // A host set with the port left at 0 is a half-configured setting,
            // not an endpoint. Skip to the next scheme rather than build a URI
            // that cannot connect.
            (!host.is_empty() && port != 0).then_some((scheme, host, port))
        })?;

    let mut builder = Proxy::builder(match scheme {
        // Socks5h, for the reason in the module note: the machine that needs
        // this setting is usually the machine whose resolver does not work.
        "socks" => ProxyProtocol::Socks5h,
        _ => ProxyProtocol::Http,
    })
    .host(&host)
    .port(port)
    .resolve_target(false);

    // GNOME's `ignore-hosts` is the same idea as `NO_PROXY`.
    for entry in gsettings("org.gnome.system.proxy", "ignore-hosts")
        .as_deref()
        .map(parse_gvariant_list)
        .unwrap_or_default()
    {
        builder = builder.no_proxy(&entry);
    }

    builder.build().ok()
}

/// One `gsettings get`, with the GVariant quoting stripped off a string value.
///
/// `None` for every failure — a session with no `gsettings` on `PATH`, a schema
/// this GNOME does not ship, a key that is not there. Not finding a proxy is
/// the normal case, so none of those are worth a message.
#[cfg(target_os = "linux")]
fn gsettings(schema: &str, key: &str) -> Option<String> {
    let output = std::process::Command::new("gsettings")
        .args(["get", schema, key])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?;
    Some(unquote(value.trim()).to_owned())
}

/// `'manual'` → `manual`. Leaves anything unquoted (an integer, a list) alone.
#[cfg(target_os = "linux")]
fn unquote(value: &str) -> &str {
    value
        .strip_prefix('\'')
        .and_then(|rest| rest.strip_suffix('\''))
        .unwrap_or(value)
}

/// `['localhost', '127.0.0.0/8']` → the two strings.
///
/// A hand-rolled reader for the one array shape this module asks for, rather
/// than a GVariant parser: the elements are hostnames and CIDR blocks, so
/// nothing here has to survive an escaped quote.
#[cfg(target_os = "linux")]
fn parse_gvariant_list(value: &str) -> Vec<String> {
    value
        .trim()
        .strip_prefix('[')
        .and_then(|rest| rest.strip_suffix(']'))
        .unwrap_or("")
        .split(',')
        .map(|entry| unquote(entry.trim()).trim().to_owned())
        .filter(|entry| !entry.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The failure this module exists for: `ALL_PROXY=socks://…` (which is what
    /// `ureq` picks even when `HTTPS_PROXY` is also exported) asks for a LOCAL
    /// lookup, on a machine whose local lookups are the broken thing. Measured
    /// before the fix: 15.00s, `timeout: global`, on every registry call.
    #[test]
    fn a_socks5_proxy_is_made_to_resolve_at_the_far_end() {
        let from_env = Proxy::new("socks://127.0.0.1:10808").unwrap();
        assert!(
            from_env.resolve_target(),
            "ureq's socks5 default is the local lookup this test is about"
        );

        let fixed = resolve_at_the_proxy(&from_env).expect("socks5 must be rewritten");
        assert!(!fixed.resolve_target(), "the proxy must do the lookup");
        assert_eq!(fixed.host(), "127.0.0.1");
        assert_eq!(fixed.port(), 10808);
    }

    /// Credentials are part of reaching the proxy at all — a rebuild that drops
    /// them turns a working proxy into an authentication failure.
    #[test]
    fn credentials_survive_the_rebuild() {
        let from_env = Proxy::new("socks5://user:secret@127.0.0.1:1080").unwrap();
        let fixed = resolve_at_the_proxy(&from_env).expect("socks5 must be rewritten");
        assert_eq!(fixed.username(), Some("user"));
        assert_eq!(fixed.password(), Some("secret"));
        assert_eq!(fixed.host(), "127.0.0.1");
        assert_eq!(fixed.port(), 1080);
    }

    /// Everything that already resolves remotely is left exactly as `ureq`
    /// parsed it, `NO_PROXY` list included.
    #[test]
    fn proxies_that_already_resolve_remotely_are_untouched() {
        for spec in ["http://127.0.0.1:10808", "socks5h://127.0.0.1:1080"] {
            let proxy = Proxy::new(spec).unwrap();
            assert!(
                resolve_at_the_proxy(&proxy).is_none(),
                "{spec} needed no rewrite"
            );
        }
        // SOCKS4 cannot carry a hostname at all, so it is not asked to.
        let socks4 = Proxy::new("socks4://127.0.0.1:1080").unwrap();
        assert!(resolve_at_the_proxy(&socks4).is_none());
    }

    #[test]
    fn the_bypass_list_reads_as_entries() {
        // SAFETY: single-threaded test process; nothing else reads the
        // environment while this runs.
        unsafe { std::env::set_var("NO_PROXY", "localhost, 127.0.0.0/8 ,,::1") };
        let entries = no_proxy_from_env();
        unsafe { std::env::remove_var("NO_PROXY") };
        assert_eq!(entries, vec!["localhost", "127.0.0.0/8", "::1"]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn gvariant_strings_lose_their_quotes() {
        assert_eq!(unquote("'manual'"), "manual");
        // An integer arrives bare, and must not be mangled into "0808".
        assert_eq!(unquote("10808"), "10808");
        assert_eq!(unquote("''"), "");
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn the_ignore_list_reads_as_entries() {
        assert_eq!(
            parse_gvariant_list("['localhost', '127.0.0.0/8', '::1']"),
            vec!["localhost", "127.0.0.0/8", "::1"]
        );
        // An empty list is no entries, not one empty entry — a `no_proxy("")`
        // would be a rule about nothing.
        assert!(parse_gvariant_list("@as []").is_empty());
        assert!(parse_gvariant_list("[]").is_empty());
    }
}
