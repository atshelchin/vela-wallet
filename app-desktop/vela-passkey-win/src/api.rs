//! The calls themselves.
//!
//! Compiled only on Windows. Read the crate docs first — in particular the note
//! that this is type-checked and never run.

use std::slice::from_raw_parts;

use windows::Win32::Foundation::{BOOL, HWND};
use windows::Win32::Networking::WindowsWebServices::*;
use windows::core::{HSTRING, PCWSTR};

use crate::{Asserted, Attachment, RegisterRequest, Registered, TIMEOUT_MS, WinError};

/// ES256, and only ES256 — the same rule the CTAP2 path enforces, for the same
/// reason: an RSA credential can never satisfy the RIP-7212 precompile, so
/// offering one mints a key that fails later, somewhere less legible.
const COSE_ES256: i32 = -7;

/// Is the Windows WebAuthn API present?
///
/// Version 1 is Windows 10 build 1903, which is also the build that took direct
/// FIDO HID access away — so on any Windows where this returns 0 there is
/// nothing to fall back TO, and the honest answer is that this machine cannot
/// use a security key.
pub fn supported() -> bool {
    unsafe { WebAuthNGetApiVersionNumber() > 0 }
}

/// Is there a Windows Hello a person can actually use — enrolled, and backed by
/// a user-verifying platform authenticator?
///
/// Distinct from [`supported`], which only asks whether the API exists. A
/// machine with no TPM, or one where nobody has set up a PIN, face or
/// fingerprint, answers `false` here and `true` there — and the difference is
/// whether "This device" should be an offer or a greyed-out row. Asking is the
/// only honest way: an enabled row that fails when tapped is worse than a row
/// that says why it cannot be used.
pub fn platform_available() -> bool {
    if !supported() {
        return false;
    }
    // The API returns an HRESULT and writes the answer out through a pointer.
    // Any failure is "no": this gates an offer, and the safe reading of "I could
    // not tell" is not to make one.
    unsafe { WebAuthNIsUserVerifyingPlatformAuthenticatorAvailable() }
        .map(|available| available.as_bool())
        .unwrap_or(false)
}

/// The `WEBAUTHN_AUTHENTICATOR_ATTACHMENT_*` value for a method.
fn attachment_value(attachment: Attachment) -> u32 {
    match attachment {
        Attachment::SecurityKey => WEBAUTHN_AUTHENTICATOR_ATTACHMENT_CROSS_PLATFORM,
        Attachment::ThisDevice => WEBAUTHN_AUTHENTICATOR_ATTACHMENT_PLATFORM,
    }
}

/// The `WEBAUTHN_CTAP_TRANSPORT_*` mask an allow-list entry should carry for a
/// method — the lever that narrows the Windows picker to one wire.
fn allow_transports(attachment: Attachment) -> u32 {
    match attachment {
        Attachment::SecurityKey => WEBAUTHN_CTAP_TRANSPORT_USB,
        Attachment::ThisDevice => WEBAUTHN_CTAP_TRANSPORT_INTERNAL,
    }
}

/// Mint a credential. Windows draws its own dialog: the picker, the touch
/// prompt, the PIN prompt, Windows Hello.
///
/// `hwnd` is the app's real window. `webauthn-authenticator-rs` creates a 1×1
/// window for this because it is a library used from console apps with no
/// window of their own; gpui gives us a genuine one through
/// `raw_window_handle`, so the dialog parents to the wallet and inherits its
/// focus and z-order for free.
pub fn register(hwnd: isize, request: &RegisterRequest<'_>) -> Result<Registered, WinError> {
    if !supported() {
        return Err(WinError::Unavailable);
    }

    // Destructured up front so the body below reads as it did when these were
    // seven parameters — the grouping is for the CALLER's sake, not this
    // function's.
    let &RegisterRequest {
        rp_id,
        rp_name,
        user_id,
        user_name,
        client_data_json,
        exclude_credential_ids,
        attachment,
    } = request;

    // Every one of these owns a buffer that the native structs below point
    // into. They are bound to names so they outlive the call; a temporary here
    // is a dangling pointer inside `webauthn.dll`.
    let rp_id_w = HSTRING::from(rp_id);
    let rp_name_w = HSTRING::from(rp_name);
    let user_name_w = HSTRING::from(user_name);
    let credential_type = HSTRING::from("public-key");
    let hash_algorithm = HSTRING::from("SHA-256");
    let mut user_id = user_id.to_vec();
    let mut client_data = client_data_json.as_bytes().to_vec();

    let rp = WEBAUTHN_RP_ENTITY_INFORMATION {
        dwVersion: WEBAUTHN_RP_ENTITY_INFORMATION_CURRENT_VERSION,
        pwszId: PCWSTR(rp_id_w.as_ptr()),
        pwszName: PCWSTR(rp_name_w.as_ptr()),
        pwszIcon: PCWSTR::null(),
    };
    let user = WEBAUTHN_USER_ENTITY_INFORMATION {
        dwVersion: WEBAUTHN_USER_ENTITY_INFORMATION_CURRENT_VERSION,
        cbId: user_id.len() as u32,
        pbId: user_id.as_mut_ptr(),
        pwszName: PCWSTR(user_name_w.as_ptr()),
        pwszIcon: PCWSTR::null(),
        // The same string for both: this wallet has one name per key, and a
        // display name that differs from the name is a second thing to keep
        // in sync for no gain.
        pwszDisplayName: PCWSTR(user_name_w.as_ptr()),
    };
    let mut algorithms = [WEBAUTHN_COSE_CREDENTIAL_PARAMETER {
        dwVersion: WEBAUTHN_COSE_CREDENTIAL_PARAMETER_CURRENT_VERSION,
        pwszCredentialType: PCWSTR(credential_type.as_ptr()),
        lAlg: COSE_ES256,
    }];
    let algorithms = WEBAUTHN_COSE_CREDENTIAL_PARAMETERS {
        cCredentialParameters: algorithms.len() as u32,
        pCredentialParameters: algorithms.as_mut_ptr(),
    };
    let client_data = WEBAUTHN_CLIENT_DATA {
        dwVersion: WEBAUTHN_CLIENT_DATA_CURRENT_VERSION,
        cbClientDataJSON: client_data.len() as u32,
        pbClientDataJSON: client_data.as_mut_ptr(),
        pwszHashAlgId: PCWSTR(hash_algorithm.as_ptr()),
    };

    // Zero transports, unlike the allow list in `assert`. These ids are every
    // key this wallet already has, including ones minted over caBLE on a phone;
    // naming a wire for them would tell Windows to look for a phone-resident
    // credential on the USB key in the port, which is not a question with an
    // answer.
    let mut exclude = CredentialList::new(exclude_credential_ids, &credential_type, 0);

    let options = WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS {
        dwVersion: WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS_CURRENT_VERSION,
        dwTimeoutMilliseconds: TIMEOUT_MS,
        // Superseded by `pExcludeCredentialList` since version 3; zeroed rather
        // than filled, because filling both is how a request ends up carrying
        // two different exclusion lists.
        CredentialList: WEBAUTHN_CREDENTIALS {
            cCredentials: 0,
            pCredentials: std::ptr::null_mut(),
        },
        Extensions: WEBAUTHN_EXTENSIONS::default(),
        // Never ANY. The person already chose a method on a screen this app
        // drew, and `ANY` would throw that choice away and offer all three
        // again in a dialog Windows draws. See [`Attachment`].
        //
        // This is the ONE lever `webauthn.dll` gives a caller over the picker
        // at make-credential time: API version 7 (the newest these bindings
        // know) has no transport filter and no credential hints on
        // `WEBAUTHN_AUTHENTICATOR_MAKE_CREDENTIAL_OPTIONS`. So a `SecurityKey`
        // registration on Windows 11 22H2+ may still show "use your phone"
        // beside the key. The ASSERTION path pins harder — see `assert`.
        dwAuthenticatorAttachment: attachment_value(attachment),
        // Discoverable, required. A credential that cannot be found at sign-in
        // is a wallet that dies with this computer.
        bRequireResidentKey: BOOL::from(true),
        dwUserVerificationRequirement: WEBAUTHN_USER_VERIFICATION_REQUIREMENT_REQUIRED,
        dwAttestationConveyancePreference: WEBAUTHN_ATTESTATION_CONVEYANCE_PREFERENCE_DIRECT,
        dwFlags: 0,
        pCancellationId: std::ptr::null_mut(),
        pExcludeCredentialList: exclude.native_ptr_mut(),
        dwEnterpriseAttestation: 0,
        dwLargeBlobSupport: 0,
        bPreferResidentKey: BOOL::from(true),
        // Everything a NEWER API version added, zeroed. `dwVersion` above tells
        // Windows how much of this struct to read, so these are never looked
        // at — and filling them in by name would be claiming support for
        // features nobody here has tested.
        ..Default::default()
    };

    let hwnd = HWND(hwnd as *mut core::ffi::c_void);
    let attestation = unsafe {
        WebAuthNAuthenticatorMakeCredential(
            hwnd,
            &rp,
            &user,
            &algorithms,
            &client_data,
            Some(&options),
        )
        .map_err(|error| classify(error.code().0))?
    };
    // Null would mean a success that returned nothing, which the API does not
    // do — but reading through a null pointer is not the way to find out.
    if attestation.is_null() {
        return Err(WinError::Other(
            "Windows reported success and returned no credential".to_owned(),
        ));
    }

    let registered = unsafe {
        let a = &*attestation;
        Registered {
            credential_id: from_raw_parts(a.pbCredentialId, a.cbCredentialId as usize).to_vec(),
            attestation_object: from_raw_parts(
                a.pbAttestationObject,
                a.cbAttestationObject as usize,
            )
            .to_vec(),
            client_data_json: client_data_json.to_owned(),
            transport: transport_name(a.dwUsedTransport),
            attachment: attachment_for(a.dwUsedTransport),
        }
    };
    unsafe { WebAuthNFreeCredentialAttestation(Some(attestation)) };

    // Named so they cannot be dropped before the call above. Without this the
    // compiler is free to end their borrows early, and the native structs hold
    // raw pointers it is not tracking.
    drop(exclude);
    drop(user_id);

    Ok(registered)
}

/// Sign. An empty `allow` is the "who are you?" ceremony — Windows draws the
/// credential picker itself, which is the same list the CTAP2 path has to build
/// by hand with `getNextAssertion`.
pub fn assert(
    hwnd: isize,
    rp_id: &str,
    client_data_json: &str,
    credential_id: Option<&[u8]>,
    attachment: Attachment,
) -> Result<Asserted, WinError> {
    if !supported() {
        return Err(WinError::Unavailable);
    }

    let rp_id_w = HSTRING::from(rp_id);
    let credential_type = HSTRING::from("public-key");
    let hash_algorithm = HSTRING::from("SHA-256");
    let mut client_data_bytes = client_data_json.as_bytes().to_vec();

    let client_data = WEBAUTHN_CLIENT_DATA {
        dwVersion: WEBAUTHN_CLIENT_DATA_CURRENT_VERSION,
        cbClientDataJSON: client_data_bytes.len() as u32,
        pbClientDataJSON: client_data_bytes.as_mut_ptr(),
        pwszHashAlgId: PCWSTR(hash_algorithm.as_ptr()),
    };

    let allow: Vec<Vec<u8>> = credential_id
        .map(|id| vec![id.to_vec()])
        .unwrap_or_default();
    // The wire, named rather than left to the authenticator. `dwTransports` on
    // an allow-list entry filters the Windows picker down to where the
    // credential actually lives — the one place the API lets a caller say "this
    // is on the key in the port, do not offer the phone". Only reachable when
    // the credential id is KNOWN; the discoverable-credential sign-in below
    // passes a null list and gets whatever Windows shows for the attachment.
    let mut allow = CredentialList::new(&allow, &credential_type, allow_transports(attachment));

    // Windows writes back into this through an `*const` request field — its
    // U2F AppId reply, which this wallet does not use and does not read.
    // Passing null is not an option: the API dereferences it.
    let mut app_id_used = BOOL::from(false);

    let options = WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS {
        dwVersion: WEBAUTHN_AUTHENTICATOR_GET_ASSERTION_OPTIONS_CURRENT_VERSION,
        dwTimeoutMilliseconds: TIMEOUT_MS,
        CredentialList: WEBAUTHN_CREDENTIALS {
            cCredentials: 0,
            pCredentials: std::ptr::null_mut(),
        },
        Extensions: WEBAUTHN_EXTENSIONS::default(),
        // As in `register`: whichever single method the person chose.
        dwAuthenticatorAttachment: attachment_value(attachment),
        dwUserVerificationRequirement: WEBAUTHN_USER_VERIFICATION_REQUIREMENT_REQUIRED,
        dwFlags: 0,
        pwszU2fAppId: PCWSTR::null(),
        pbU2fAppId: std::ptr::addr_of_mut!(app_id_used),
        pCancellationId: std::ptr::null_mut(),
        pAllowCredentialList: allow.native_ptr_mut(),
        dwCredLargeBlobOperation: 0,
        cbCredLargeBlob: 0,
        pbCredLargeBlob: std::ptr::null_mut(),
        // As above: zeroed, and unread at the version this requests.
        ..Default::default()
    };

    let hwnd = HWND(hwnd as *mut core::ffi::c_void);
    let assertion = unsafe {
        WebAuthNAuthenticatorGetAssertion(hwnd, &rp_id_w, &client_data, Some(&options))
            .map_err(|error| classify(error.code().0))?
    };
    if assertion.is_null() {
        return Err(WinError::Other(
            "Windows reported success and returned no assertion".to_owned(),
        ));
    }

    let asserted = unsafe {
        let a = &*assertion;
        Asserted {
            credential_id: from_raw_parts(a.Credential.pbId, a.Credential.cbId as usize).to_vec(),
            authenticator_data: from_raw_parts(
                a.pbAuthenticatorData,
                a.cbAuthenticatorData as usize,
            )
            .to_vec(),
            signature: from_raw_parts(a.pbSignature, a.cbSignature as usize).to_vec(),
            // Absent and empty are different facts, and the core's name
            // resolution branches on which one this is.
            user_id: (a.cbUserId > 0 && !a.pbUserId.is_null())
                .then(|| from_raw_parts(a.pbUserId, a.cbUserId as usize).to_vec()),
            client_data_json: client_data_json.to_owned(),
        }
    };
    unsafe { WebAuthNFreeAssertion(assertion) };

    drop(allow);
    drop(client_data_bytes);

    Ok(asserted)
}

/// An owned `WEBAUTHN_CREDENTIAL_LIST` and everything it points at.
///
/// Three levels of indirection, all borrowed: the list holds an array of
/// POINTERS to entries, each entry points at an id. Pinned because the entries
/// vector's address is baked into the pointer array the moment it is built.
struct CredentialList {
    // All three are held for their ADDRESSES, not their values: `list` points
    // into `_pointers`, each of which points into `_entries`, each of which
    // points into `_ids`. Nothing reads them again through these names, and
    // dropping any one early leaves `webauthn.dll` reading freed memory —
    // which is why they are fields rather than locals.
    //
    // Plain `Vec`s, not `Pin<Box<Vec<_>>>`: what has to stay put is each
    // vector's heap BUFFER, and that does not move when the vector's header
    // does. Pinning the header would be guarding the wrong thing. What does
    // move a buffer is a reallocation, and none of these is touched after it
    // is built.
    _ids: Vec<Vec<u8>>,
    _entries: Vec<WEBAUTHN_CREDENTIAL_EX>,
    _pointers: Vec<*mut WEBAUTHN_CREDENTIAL_EX>,
    list: WEBAUTHN_CREDENTIAL_LIST,
    empty: bool,
}

impl CredentialList {
    /// `transports` is the `WEBAUTHN_CTAP_TRANSPORT_*` mask every entry
    /// carries. Zero means "the authenticator decides", which is right for an
    /// exclude list; an allow list naming a credential this wallet knows is on
    /// a USB key says so, and Windows narrows its picker to match.
    fn new(ids: &[Vec<u8>], credential_type: &HSTRING, transports: u32) -> Self {
        let mut ids: Vec<Vec<u8>> = ids.to_vec();
        let mut entries: Vec<WEBAUTHN_CREDENTIAL_EX> = ids
            .iter_mut()
            .map(|id| WEBAUTHN_CREDENTIAL_EX {
                dwVersion: WEBAUTHN_CREDENTIAL_EX_CURRENT_VERSION,
                cbId: id.len() as u32,
                pbId: id.as_mut_ptr(),
                pwszCredentialType: PCWSTR(credential_type.as_ptr()),
                dwTransports: transports,
            })
            .collect();
        let mut pointers: Vec<*mut WEBAUTHN_CREDENTIAL_EX> =
            entries.iter_mut().map(|entry| entry as *mut _).collect();
        let list = WEBAUTHN_CREDENTIAL_LIST {
            cCredentials: pointers.len() as u32,
            ppCredentials: pointers.as_mut_ptr(),
        };
        let empty = list.cCredentials == 0;
        Self {
            _ids: ids,
            _entries: entries,
            _pointers: pointers,
            list,
            empty,
        }
    }

    /// Null for an empty list, NOT a list of length zero.
    ///
    /// The API treats a present-but-empty allow list as "these zero credentials
    /// and no others", which matches nothing — so a sign-in that means "any
    /// discoverable credential" has to pass null.
    fn native_ptr_mut(&mut self) -> *mut WEBAUTHN_CREDENTIAL_LIST {
        if self.empty {
            std::ptr::null_mut()
        } else {
            &mut self.list
        }
    }
}

/// Windows' `HRESULT` in the vocabulary a browser would have used.
///
/// `WebAuthNGetErrorName` maps the code to the WebAuthn DOM exception name —
/// `NotAllowedError` and friends — which is the same vocabulary the web
/// client's own classifier reads. Mapping numbers by hand would be inventing a
/// second answer to a question Windows already answers.
fn classify(code: i32) -> WinError {
    let name = unsafe { WebAuthNGetErrorName(windows::core::HRESULT(code)) };
    let name = unsafe { name.to_string() }.unwrap_or_default();
    match name.as_str() {
        // The person declined, or the dialog timed out waiting for them.
        // Windows does not distinguish those, and neither does a browser.
        "NotAllowedError" => WinError::Cancelled,
        // With an exclusion list set, this means the chosen authenticator
        // already holds one of this wallet's keys.
        "InvalidStateError" => WinError::AlreadyRegistered,
        "NotSupportedError" | "ConstraintError" => WinError::NotSupported,
        "" => WinError::Other(format!("Windows WebAuthn error 0x{code:08x}")),
        other => WinError::Other(other.to_owned()),
    }
}

/// The transport Windows says it used, in WebAuthn's own spelling — the same
/// strings the browser path stores on a key row.
fn transport_name(transport: u32) -> String {
    match transport {
        WEBAUTHN_CTAP_TRANSPORT_USB => "usb",
        WEBAUTHN_CTAP_TRANSPORT_NFC => "nfc",
        WEBAUTHN_CTAP_TRANSPORT_BLE => "ble",
        WEBAUTHN_CTAP_TRANSPORT_INTERNAL => "internal",
        WEBAUTHN_CTAP_TRANSPORT_HYBRID => "hybrid",
        _ => "",
    }
    .to_owned()
}

/// `internal` is Windows Hello — a platform authenticator. Everything else came
/// in over a wire and is cross-platform.
fn attachment_for(transport: u32) -> String {
    match transport {
        WEBAUTHN_CTAP_TRANSPORT_INTERNAL => "platform",
        // Windows declined to say, so neither do we. Guessing
        // "cross-platform" here would put a wrong provider line on a key row.
        0 => "",
        _ => "cross-platform",
    }
    .to_owned()
}
