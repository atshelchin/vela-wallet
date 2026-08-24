//! On-device storage for the wallet's account list.
//!
//! One JSON file under the platform config directory, holding the SAME KEYS the
//! browser puts in `localStorage` and the Expo client puts in AsyncStorage:
//! `vela.accounts`, `vela.activeAccountIndex`, `vela.pendingUploads`,
//! `vela.serviceEndpoints`. Those names are not decoration — they are how a
//! record written by one client is still legible after it is copied to another,
//! and they are what the operations contract pins.
//!
//! ## The invariant every function here carries
//!
//! `Account` holds both the legacy scalar key fields and the full `keys` array,
//! and the core derives the address from **all** keys. A mapper that copies an
//! account field by field and drops `keys` does not merely lose data: it
//! silently "repairs" a multi-key account into a different, wrong, single-key
//! Safe on the next restore, at an address nothing can deploy. So nothing here
//! reshapes an account. Records go in and come out whole, as
//! `serde_json::Value` all the way to the core's own `serde` impls.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Map, Value};

use vela_core::app::{Account, PendingUpload};

/// The four keys, spelled exactly as every other client spells them.
pub const KEY_ACCOUNTS: &str = "vela.accounts";
pub const KEY_ACTIVE_INDEX: &str = "vela.activeAccountIndex";
pub const KEY_PENDING_UPLOADS: &str = "vela.pendingUploads";
pub const KEY_SERVICE_ENDPOINTS: &str = "vela.serviceEndpoints";

/// The storage failed in a way the core answers with `storage_failed`, never a
/// crash: a read-only home directory, a full disk, a file another process holds.
#[derive(Debug)]
pub struct StorageError(pub String);

impl std::fmt::Display for StorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

type Result<T> = std::result::Result<T, StorageError>;

/// Serialises writes within this process. Two screens can be saving at once —
/// the session machine's migration write-back and an onboarding save — and the
/// file is rewritten whole, so an interleave would lose one of them.
static LOCK: Mutex<()> = Mutex::new(());

/// Where the file lives.
///
/// `dirs::config_dir()` rather than a hand-rolled `~/.vela`: each desktop has
/// its own convention (`~/Library/Application Support`, `%APPDATA%`,
/// `$XDG_CONFIG_HOME`) and a wallet that ignores it is a wallet the platform's
/// own backup and migration tools do not know about.
pub fn path() -> Result<PathBuf> {
    let base = dirs::config_dir().ok_or_else(|| {
        StorageError("this system has no configuration directory".to_owned())
    })?;
    Ok(base.join("VelaWallet").join("wallet.json"))
}

fn read_all() -> Result<Map<String, Value>> {
    let path = path()?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        // A file that is not there yet is an empty wallet, not a failure.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Map::new()),
        Err(error) => return Err(StorageError(format!("{}: {error}", path.display()))),
    };
    match serde_json::from_str::<Value>(&raw) {
        Ok(Value::Object(map)) => Ok(map),
        // Corrupt JSON reads as empty rather than throwing, exactly as the web
        // client does: a damaged file must not make the wallet permanently
        // unopenable, and every write below replaces the whole document.
        _ => Ok(Map::new()),
    }
}

fn write_all(map: Map<String, Value>) -> Result<()> {
    let path = path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| StorageError(format!("{}: {error}", parent.display())))?;
    }
    let body = serde_json::to_string_pretty(&Value::Object(map))
        .map_err(|error| StorageError(error.to_string()))?;

    // Write beside the target and rename over it. A crash halfway through a
    // direct write leaves a truncated account list, and an account list that
    // parses as EMPTY is indistinguishable from being signed out.
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, body)
        .map_err(|error| StorageError(format!("{}: {error}", temporary.display())))?;
    fs::rename(&temporary, &path)
        .map_err(|error| StorageError(format!("{}: {error}", path.display())))
}

fn read_list(key: &str) -> Result<Vec<Value>> {
    Ok(match read_all()?.get(key) {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    })
}

fn write_key(key: &str, value: Value) -> Result<()> {
    let Ok(_guard) = LOCK.lock() else {
        return Err(StorageError("the storage lock is poisoned".to_owned()));
    };
    let mut map = read_all()?;
    map.insert(key.to_owned(), value);
    write_all(map)
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

pub fn load_accounts() -> Result<Vec<Account>> {
    let mut accounts = Vec::new();
    for item in read_list(KEY_ACCOUNTS)? {
        // A record that will not deserialize is SKIPPED, not fatal. One
        // corrupt entry among five must not lock a person out of the other
        // four; the whole-list failure mode is what `AccountsUnavailable` is
        // for, and it is reserved for the file itself being unreadable.
        if let Ok(account) = serde_json::from_value::<Account>(item) {
            accounts.push(account);
        }
    }
    Ok(accounts)
}

/// Upsert by id. The whole record is written — see the invariant above.
pub fn save_account(account: &Account) -> Result<()> {
    let Ok(_guard) = LOCK.lock() else {
        return Err(StorageError("the storage lock is poisoned".to_owned()));
    };
    let mut map = read_all()?;
    let mut accounts = match map.get(KEY_ACCOUNTS) {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    };
    let encoded = serde_json::to_value(account).map_err(|error| StorageError(error.to_string()))?;
    let at = accounts
        .iter()
        .position(|item| item.get("id") == encoded.get("id"));
    match at {
        Some(at) => accounts[at] = encoded,
        None => accounts.push(encoded),
    }
    map.insert(KEY_ACCOUNTS.to_owned(), Value::Array(accounts));
    write_all(map)
}

pub fn load_active_index() -> usize {
    // Missing, garbage and negative all read as 0. A negative index would make
    // the session render an empty address with a wallet present, which the core
    // forbids — so it fails closed here rather than at the wire.
    read_all()
        .ok()
        .and_then(|map| map.get(KEY_ACTIVE_INDEX).cloned())
        .and_then(|value| match value {
            Value::Number(number) => number.as_i64(),
            Value::String(text) => text.parse::<i64>().ok(),
            _ => None,
        })
        .filter(|index| *index > 0)
        .and_then(|index| usize::try_from(index).ok())
        .unwrap_or(0)
}

pub fn save_active_index(index: usize) -> Result<()> {
    write_key(KEY_ACTIVE_INDEX, json!(index))
}

// ---------------------------------------------------------------------------
// Pending uploads
// ---------------------------------------------------------------------------

pub fn load_pending_uploads() -> Result<Vec<PendingUpload>> {
    let mut pending = Vec::new();
    for item in read_list(KEY_PENDING_UPLOADS)? {
        if let Ok(record) = serde_json::from_value::<PendingUpload>(item) {
            pending.push(record);
        }
    }
    Ok(pending)
}

pub fn has_pending_uploads() -> Result<bool> {
    Ok(!read_list(KEY_PENDING_UPLOADS)?.is_empty())
}

/// Keyed by `id`, which for a pending upload IS the credential id of its first
/// founding key.
pub fn save_pending_upload(record: &PendingUpload) -> Result<()> {
    let Ok(_guard) = LOCK.lock() else {
        return Err(StorageError("the storage lock is poisoned".to_owned()));
    };
    let mut map = read_all()?;
    let encoded = serde_json::to_value(record).map_err(|error| StorageError(error.to_string()))?;
    let mut pending = match map.get(KEY_PENDING_UPLOADS) {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    };
    pending.retain(|item| item.get("id") != encoded.get("id"));
    pending.push(encoded);
    map.insert(KEY_PENDING_UPLOADS.to_owned(), Value::Array(pending));
    write_all(map)
}

pub fn remove_pending_upload(credential_id: &str) -> Result<()> {
    let Ok(_guard) = LOCK.lock() else {
        return Err(StorageError("the storage lock is poisoned".to_owned()));
    };
    let mut map = read_all()?;
    let mut pending = match map.get(KEY_PENDING_UPLOADS) {
        Some(Value::Array(items)) => items.clone(),
        _ => Vec::new(),
    };
    pending.retain(|item| item.get("id").and_then(Value::as_str) != Some(credential_id));
    map.insert(KEY_PENDING_UPLOADS.to_owned(), Value::Array(pending));
    write_all(map)
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/// The saved registry endpoint override, if any.
pub fn load_registry_endpoint() -> Option<String> {
    read_all()
        .ok()?
        .get(KEY_SERVICE_ENDPOINTS)?
        .get("registry")?
        .as_str()
        .map(str::to_owned)
}

pub fn save_registry_endpoint(url: &str) -> Result<()> {
    write_key(KEY_SERVICE_ENDPOINTS, json!({ "registry": url }))
}

// ---------------------------------------------------------------------------
// Sign-out
// ---------------------------------------------------------------------------

/// Forget which wallet this computer is signed into — the account list and the
/// active index, and NOTHING else.
///
/// The scope is the decision, not an implementation detail. Contacts, history,
/// custom tokens and networks, endpoints and preferences belong to the ACCOUNT
/// rather than to the session, and the account comes back intact because its
/// address derives from the passkey rather than from disk. The pending-upload
/// outbox is excluded for a second, independent reason: a record there is a
/// public key the registry never confirmed, and the next launch can still retry
/// it — but a deleted record can never be retried, and that credential becomes
/// unfindable at sign-in.
pub fn clear_signed_in_wallet() -> Result<()> {
    let Ok(_guard) = LOCK.lock() else {
        return Err(StorageError("the storage lock is poisoned".to_owned()));
    };
    let mut map = read_all()?;
    map.remove(KEY_ACCOUNTS);
    map.remove(KEY_ACTIVE_INDEX);
    write_all(map)
}
