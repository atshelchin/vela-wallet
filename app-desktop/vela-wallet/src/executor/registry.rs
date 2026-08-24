//! The public-key registry, over HTTP.
//!
//! A port of `app-web/.../onboarding/core/registry.ts` and `publish.ts` — the
//! same six calls, the same two guards, the same one judgement.
//!
//! **The one judgement**: whether a request reached the server. The core
//! branches on it (`index_failed { network }`), and only a shell can tell a
//! transport failure from a 4xx. Everything else about a registry failure is
//! the core's to interpret, and nothing here decides what happens next.
//!
//! **The two guards** are on `queryUnit`, and both refuse rather than degrade:
//! a group larger than a wallet's 7-key cap is not ours, and a partial page
//! would rebuild the Safe address from a SUBSET of the founding set — a
//! different, wrong, fundable address.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::json;
use ureq::Agent;

use vela_core::app::{RegistryPublishMember, RegistryUnitMember};
use vela_core::registry_proof::{RegistryProof, build_group_proof, build_member_proof};

use super::passkey::{self, Ceremony, RELYING_PARTY};

/// The v2 registry. Overridable so a self-hosted stack is a setting, not a
/// fork.
pub const DEFAULT_REGISTRY_URL: &str = "https://p256-index-v2.getvela.app";

/// The health identities this endpoint accepts — the legacy index and the v2
/// registry, so a wallet can point at either during the migration.
const SERVICE_IDENTITIES: [&str; 2] = [
    "webauthn-p256-publickey-registry",
    "webauthn-p256-publickey-index",
];

const READ_TIMEOUT: Duration = Duration::from_secs(15);
const WRITE_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_TIMEOUT: Duration = Duration::from_secs(120);
const POLL_INTERVAL: Duration = Duration::from_secs(2);

/// A vela wallet's founding set is capped at 7 keys; a larger group is not ours
/// and must never be reconstructed into an account.
const MAX_UNIT_MEMBERS: usize = 7;

/// A request that never reached the server, as opposed to one the server
/// refused. An unreachable index is a transient condition the person can fix by
/// pointing somewhere else; a 4xx is an answer.
#[derive(Debug)]
pub struct RegistryError {
    pub message: String,
    pub network: bool,
}

impl RegistryError {
    fn network(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            network: true,
        }
    }

    fn answered(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            network: false,
        }
    }
}

type Result<T> = std::result::Result<T, RegistryError>;

/// The configured endpoint. A `Mutex` rather than a field on the executor
/// because the endpoint-settings surface can change it from a screen while a
/// health probe is already in flight on another thread.
fn endpoint() -> &'static Mutex<String> {
    static ENDPOINT: OnceLock<Mutex<String>> = OnceLock::new();
    ENDPOINT.get_or_init(|| Mutex::new(DEFAULT_REGISTRY_URL.to_owned()))
}

pub fn set_registry_url(url: &str) {
    let cleaned = url
        .trim()
        .replace(['\r', '\n'], "")
        .trim_end_matches('/')
        .to_owned();
    let value = if cleaned.is_empty() {
        DEFAULT_REGISTRY_URL.to_owned()
    } else {
        cleaned
    };
    if let Ok(mut slot) = endpoint().lock() {
        *slot = value;
    }
}

pub fn registry_url() -> String {
    endpoint()
        .lock()
        .map(|slot| slot.clone())
        .unwrap_or_else(|_| DEFAULT_REGISTRY_URL.to_owned())
}

/// One agent, reused. Connection reuse matters here: the publish path makes a
/// challenge call, a register call and then polls a task every two seconds, and
/// a fresh TLS handshake for each of those is most of the wall clock.
fn agent(timeout: Duration) -> Agent {
    Agent::config_builder()
        .timeout_global(Some(timeout))
        .build()
        .new_agent()
}

/// Turn a ureq error into the one bit of classification the core needs.
///
/// `StatusCode` is the ONLY variant that means the server answered. Everything
/// else — DNS, TLS, a refused connection, a timeout — is a request that never
/// arrived, and the core offers the person a different endpoint for exactly
/// that case.
fn classify(label: &str, error: ureq::Error) -> RegistryError {
    match error {
        ureq::Error::StatusCode(status) => {
            RegistryError::answered(format!("{label} failed: {status}"))
        }
        other => RegistryError::network(format!("{label} failed: {other}")),
    }
}

fn get_json<T: serde::de::DeserializeOwned>(
    path: &str,
    label: &str,
    timeout: Duration,
) -> Result<T> {
    agent(timeout)
        .get(format!("{}{path}", registry_url()))
        .call()
        .map_err(|error| classify(label, error))?
        .body_mut()
        .read_json::<T>()
        .map_err(|error| {
            RegistryError::answered(format!("{label} returned unreadable JSON: {error}"))
        })
}

fn post_json<T: serde::de::DeserializeOwned>(
    path: &str,
    body: serde_json::Value,
    label: &str,
    timeout: Duration,
) -> Result<T> {
    agent(timeout)
        .post(format!("{}{path}", registry_url()))
        .send_json(body)
        .map_err(|error| classify(label, error))?
        .body_mut()
        .read_json::<T>()
        .map_err(|error| {
            RegistryError::answered(format!("{label} returned unreadable JSON: {error}"))
        })
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct ChallengeValue {
    pub challenge: String,
    #[serde(rename = "publicKey", default)]
    pub public_key: String,
}

#[derive(Debug, Deserialize)]
struct GroupChallenge {
    #[serde(rename = "groupChallenge")]
    group_challenge: ChallengeValue,
    #[serde(default)]
    members: Vec<ChallengeValue>,
}

/// MEMBER-mode challenge: one founding passkey confirming AT CREATION. It binds
/// only (groupPublicKey, own attestation), so it exists before the rest of the
/// set does — which is what makes the interleaved create→confirm flow work.
pub fn member_challenge(
    group_public_key_hex: &str,
    public_key_hex: &str,
    attestation_hex: &str,
) -> Result<String> {
    let value: ChallengeValue = post_json(
        "/api/challenge",
        json!({
            "rpId": RELYING_PARTY,
            "groupPublicKey": group_public_key_hex,
            "publicKey": public_key_hex,
            "attestation": attestation_hex,
        }),
        "Challenge",
        READ_TIMEOUT,
    )?;
    Ok(value.challenge)
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct KeyProfile {
    entry: Option<serde_json::Value>,
    #[serde(default)]
    groups: Option<KeyGroups>,
}

#[derive(Debug, Deserialize)]
struct KeyGroups {
    #[serde(rename = "unitIds", default)]
    unit_ids: Vec<i64>,
}

pub struct KeyStatus {
    pub registered: bool,
    pub unit_ids: Vec<u32>,
}

pub fn query_by_public_key(public_key_hex: &str) -> Result<KeyStatus> {
    let profile: KeyProfile = get_json(
        &format!("/api/query?publicKey={}", urlencode(public_key_hex)),
        "Query",
        READ_TIMEOUT,
    )?;
    let raw = profile
        .groups
        .map(|groups| groups.unit_ids)
        .unwrap_or_default();
    let mut unit_ids = Vec::with_capacity(raw.len());
    for id in raw {
        // The core speaks u32 unit ids because the wire is JSON. An id past
        // 2^32 would truncate into a DIFFERENT group, so this fails the query
        // instead of quietly fetching the wrong founding set.
        match u32::try_from(id) {
            Ok(id) => unit_ids.push(id),
            Err(_) => {
                return Err(RegistryError::answered(format!(
                    "Query failed: unit id {id} is out of u32 range"
                )));
            }
        }
    }
    Ok(KeyStatus {
        registered: profile.entry.is_some_and(|entry| !entry.is_null()),
        unit_ids,
    })
}

#[derive(Debug, Deserialize)]
struct UnitResponse {
    unit: UnitMeta,
    #[serde(default)]
    members: Option<UnitMembers>,
}

#[derive(Debug, Deserialize)]
struct UnitMeta {
    metadata: String,
}

#[derive(Debug, Deserialize)]
struct UnitMembers {
    #[serde(default)]
    total: usize,
    #[serde(default)]
    items: Vec<UnitMember>,
}

#[derive(Debug, Deserialize)]
struct UnitMember {
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "credentialId")]
    credential_id: String,
    #[serde(rename = "authenticatorAttachment", default)]
    authenticator_attachment: String,
    #[serde(default)]
    transports: String,
}

pub struct UnitDetail {
    pub metadata_hex: String,
    pub members: Vec<RegistryUnitMember>,
}

/// One group: the frozen metadata blob and ALL its founding members in
/// ascending order, which IS the canonical founding order the Safe address
/// derivation pins.
pub fn query_unit(unit_id: u32) -> Result<UnitDetail> {
    let detail: UnitResponse = get_json(
        &format!("/api/query?unitId={unit_id}&pageSize={MAX_UNIT_MEMBERS}&order=asc"),
        "Query",
        READ_TIMEOUT,
    )?;
    let members = detail.members.unwrap_or(UnitMembers {
        total: 0,
        items: Vec::new(),
    });
    if members.total > MAX_UNIT_MEMBERS {
        return Err(RegistryError::answered(format!(
            "Query failed: unit {unit_id} has {} members (cap {MAX_UNIT_MEMBERS})",
            members.total
        )));
    }
    if members.items.len() != members.total {
        return Err(RegistryError::answered(format!(
            "Query failed: unit {unit_id} page holds {} of {} members",
            members.items.len(),
            members.total
        )));
    }
    Ok(UnitDetail {
        metadata_hex: detail.unit.metadata,
        members: members
            .items
            .into_iter()
            .map(|member| RegistryUnitMember {
                credential_id: member.credential_id,
                public_key_hex: member.public_key,
                authenticator_attachment: member.authenticator_attachment,
                transports: member.transports,
            })
            .collect(),
    })
}

#[derive(Debug, Deserialize)]
struct Health {
    #[serde(default)]
    service: String,
    #[serde(default)]
    status: String,
}

/// One health probe. Never fails outward: the core asked a yes/no question.
pub fn probe_health() -> bool {
    // The cache buster mirrors the web client's `?_t=`: an intermediary that
    // cached a 200 would make an unreachable endpoint look healthy, which is
    // the one answer this probe must never give wrongly.
    let nonce = vela_core::primitives::to_hex(&passkey::random(8), false);
    match get_json::<Health>(&format!("/api/health?_t={nonce}"), "Health", READ_TIMEOUT) {
        Ok(health) => {
            SERVICE_IDENTITIES.contains(&health.service.as_str()) && health.status == "ok"
        }
        Err(_) => false,
    }
}

#[derive(Debug, Deserialize)]
struct LegacyRecord {
    #[serde(default)]
    name: String,
}

/// The v1 index's display name for a credential — the only place a v1-era
/// wallet's name survives. Best effort and read-only; a lost name degrades the
/// label, never the flow.
pub fn legacy_name(credential_id: &str) -> Option<String> {
    let record: LegacyRecord = get_json(
        &format!("/api/query?credentialId={}", urlencode(credential_id)),
        "Legacy name",
        READ_TIMEOUT,
    )
    .ok()?;
    let name = record.name.trim();
    (!name.is_empty()).then(|| name.to_owned())
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

/// One member as the REGISTRY wants it.
///
/// Spelled out rather than derived from `RegistryPublishMember`. The core's
/// wire type is snake_case because it is generated from Rust; the registry's
/// HTTP API is camelCase. Sending `public_key_hex` where the server reads
/// `publicKey` is answered with `members[0]: publicKey is required` — AFTER the
/// person has minted and confirmed every key. The two vocabularies meet here,
/// in one function, and nowhere else.
#[derive(Debug, Serialize)]
struct ApiMember {
    #[serde(rename = "publicKey")]
    public_key: String,
    #[serde(rename = "attestation", skip_serializing_if = "String::is_empty")]
    attestation: String,
    #[serde(rename = "credentialId")]
    credential_id: String,
    #[serde(rename = "authenticatorAttachment")]
    authenticator_attachment: String,
    transports: String,
    proof: RegistryProof,
}

#[derive(Debug, Deserialize)]
struct Accepted {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    status: String,
}

#[derive(Debug, Deserialize)]
struct TaskStatus {
    #[serde(default)]
    status: String,
    #[serde(default)]
    error: Option<String>,
}

/// Publish a wallet's founding key set as one possession-proven group.
///
/// With `seed_hex` set (the interleaved create flow) the members already carry
/// creation-time proofs and this only closes the group — no prompts. Empty (the
/// login re-publish) runs the legacy mechanism: fresh group key, challenges,
/// one assertion per member.
pub fn publish(
    metadata_hex: &str,
    members: &[RegistryPublishMember],
    seed_hex: &str,
    group_public_key_hex: &str,
    ceremony: &Ceremony,
) -> Result<()> {
    if members.is_empty() {
        return Err(RegistryError::answered(
            "registry publish needs at least one member",
        ));
    }

    let (seed_hex, group_public_key) = if seed_hex.is_empty() || group_public_key_hex.is_empty() {
        let seed = vela_core::primitives::to_hex(&passkey::random(32), false);
        let public = vela_core::registry_proof::group_public_key_from_seed(&seed)
            .map_err(|error| RegistryError::answered(format!("group key: {error}")))?;
        (seed, public)
    } else {
        (seed_hex.to_owned(), group_public_key_hex.to_owned())
    };

    let challenge: GroupChallenge = post_json(
        "/api/challenge",
        json!({
            "rpId": RELYING_PARTY,
            "metadata": metadata_hex,
            "groupPublicKey": group_public_key,
            "members": members
                .iter()
                .map(|member| json!({
                    "publicKey": member.public_key_hex,
                    "attestation": member.attestation_hex,
                }))
                .collect::<Vec<_>>(),
        }),
        "Challenge",
        READ_TIMEOUT,
    )?;

    let mut proven = Vec::with_capacity(members.len());
    for member in members {
        let proof = match &member.proof {
            Some(proof) => proof.clone(),
            None => {
                // A member with no creation-time proof signs live. On desktop
                // that means one touch of the security key per such member —
                // which is the login re-publish path, not the create path.
                let derived = challenge
                    .members
                    .iter()
                    .find(|candidate| {
                        candidate
                            .public_key
                            .eq_ignore_ascii_case(&member.public_key_hex)
                    })
                    .ok_or_else(|| {
                        RegistryError::answered(format!(
                            "registry challenge is missing member {}",
                            member.public_key_hex
                        ))
                    })?;
                let challenge_bytes =
                    vela_core::primitives::from_hex(strip_hex(&derived.challenge)).map_err(
                        |error| RegistryError::answered(format!("challenge is not hex: {error}")),
                    )?;
                let assertion =
                    passkey::assert(&challenge_bytes, Some(&member.credential_id), ceremony)
                        .map_err(|failure| {
                            // A ceremony failure inside a publish is not a
                            // network failure. It is reported as an answered
                            // one so the core does not offer to change the
                            // endpoint over a cancelled touch.
                            RegistryError::answered(
                                failure
                                    .message
                                    .unwrap_or_else(|| "the signature was refused".to_owned()),
                            )
                        })?;
                build_member_proof(
                    &assertion.authenticator_data_hex,
                    &assertion.client_data_json_hex,
                    &assertion.signature_der_hex,
                )
                .map_err(|error| RegistryError::answered(format!("member proof: {error}")))?
            }
        };
        proven.push(ApiMember {
            public_key: member.public_key_hex.clone(),
            attestation: member.attestation_hex.clone(),
            credential_id: member.credential_id.clone(),
            authenticator_attachment: member.authenticator_attachment.clone(),
            transports: member.transports.clone(),
            proof,
        });
    }

    // The group key silently closes over the content hash.
    let group = build_group_proof(
        &seed_hex,
        RELYING_PARTY,
        strip_hex(&challenge.group_challenge.challenge),
    )
    .map_err(|error| RegistryError::answered(format!("group proof: {error}")))?;

    let accepted: Accepted = post_json(
        "/api/register",
        json!({
            "rpId": RELYING_PARTY,
            "metadata": metadata_hex,
            "groupPublicKey": group_public_key,
            "groupProof": group.proof,
            "members": proven,
        }),
        "Register",
        WRITE_TIMEOUT,
    )?;

    // `done` up front means the identical group was already on-chain —
    // idempotent by content hash, and just as landed as a fresh one.
    if accepted.status == "done" {
        return Ok(());
    }
    let id = accepted
        .id
        .ok_or_else(|| RegistryError::answered("register was accepted without a task id"))?;
    await_task(&id)
}

/// Poll until terminal.
///
/// A transient read failure is retried until the budget runs out: the task is
/// already accepted, so giving up on one bad read would report a failure that
/// did not happen.
fn await_task(id: &str) -> Result<()> {
    let deadline = Instant::now() + POLL_TIMEOUT;
    let mut last_error: Option<String> = None;
    while Instant::now() < deadline {
        match get_json::<TaskStatus>(
            &format!("/api/task/{}", urlencode(id)),
            "Task status",
            READ_TIMEOUT,
        ) {
            Ok(task) if task.status == "done" => return Ok(()),
            Ok(task) if task.status == "failed" => {
                return Err(RegistryError::answered(format!(
                    "Register failed: {}",
                    task.error.unwrap_or_else(|| "unknown".to_owned())
                )));
            }
            Ok(_) => {}
            Err(error) if !error.network => return Err(error),
            Err(error) => last_error = Some(error.message),
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    Err(RegistryError::network(format!(
        "Register timed out after {}s{}",
        POLL_TIMEOUT.as_secs(),
        last_error
            .map(|error| format!(": {error}"))
            .unwrap_or_default()
    )))
}

fn strip_hex(value: &str) -> &str {
    value.strip_prefix("0x").unwrap_or(value)
}

/// Percent-encode the characters that can appear in a credential id or a unit
/// id and would otherwise change what is being asked for. Hand-rolled because
/// the alternative is a URL crate for two call sites whose inputs are hex.
fn urlencode(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (byte as char).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}
