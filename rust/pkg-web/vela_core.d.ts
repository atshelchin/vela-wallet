/* tslint:disable */
/* eslint-disable */
/**
 * A `count` as it arrives from JS.
 *
 * `serde_json::Value` cannot hold `Infinity` or `NaN` — JSON has no syntax for
 * them, so `serde_wasm_bindgen` turns both into `null`. That silently rendered
 * `{{count}}` as the empty string where i18next renders `\"Infinity\"`. The
 * committed corpus never caught it, because it encodes those values with a
 * `{\"__t\":\"infinity\"}` tag and so never exercises the raw-number path a real
 * caller takes. `scripts/verify-i18n-parity.mjs`\'s fuzz pass did.
 *
 * Untagged, with `f64` FIRST: a JS number deserialises straight into `f64`,
 * non-finite values included, before the `Value` arm can flatten it.
 */
export type CountValue = number | string | Value;

/**
 * An interpolation variable as it arrives from JS.
 *
 * Same defect as `CountValue`, same device — and it took a second sighting to
 * notice the fix had been applied to `count` alone. Every OTHER variable still
 * went through `serde_json::Value`, so `t(\'time.minutesShort\', { n: NaN })`
 * rendered `\"分前\"` where i18next renders `\"NaN分前\"`. That one is reachable in
 * production: `src/services/activity.ts:116` passes `{ n: Math.round(diff / 60) }`.
 *
 * The corpus cannot catch this class at all — it encodes non-finite values as
 * `{\"__t\":\"nan\"}` and decodes the tag back on the Rust side, so a vector never
 * crosses the raw-number boundary a live caller crosses (spec 005 FR-024).
 */
export type VarValue = number | Value;

/**
 * Flattened `IdenticonParams` — the same shape `getIdenticonsParams` returns in
 * the JS library, so migrating call sites stay recognisable.
 */
export interface IdenticonParams {
    main: string;
    background: string;
    accent: string;
    top: string;
    sides: string;
    face: string;
    bottom: string;
}

/**
 * Per-call translation options, shaped so a TS caller writes the i18next object
 * literal verbatim — `{ count: 3, name: \'Alice\' }`. The reserved names are typed;
 * everything else falls into `vars` through `#[serde(flatten)]`.
 */
export interface TOptions extends Map<string, VarValue> {
    /**
     * Untyped: i18next accepts a number, a string (which silently DISABLES plural
     * handling), `null`, an object, or a BigInt (which makes it throw). Typing
     * this as `f64` would reject inputs the oracle accepts.
     *
     * Double `Option` because `Option<Value>` collapses an explicit JSON `null`
     * into `None`, which would make `count: null` indistinguishable from an absent
     * count — and upstream those differ: `null` still pluralises (`Number(null)`
     * is 0), while absent does not.
     */
    count?: CountValue | undefined | undefined;
    /**
     * Untyped for the same reason — a numeric context is coerced, not rejected.
     */
    context?: Value | undefined;
    /**
     * Untyped because i18next accepts a string, a number, a boolean, an object
     * or an array here, and the last two are non-strings this engine rejects
     * rather than approximates.
     */
    defaultValue?: Value | undefined;
    /**
     * Per-call language override. **Not** `changeLanguage`: `zh_TW` resolves to
     * `zh` there and falls through to English here.
     */
    lng?: string | undefined;
    ordinal?: boolean;
    /**
     * Per-call namespace override. Anything but `translation` misses.
     */
    ns?: string | undefined;
    /**
     * `keySeparator: false` — look the key up as ONE literal property.
     */
    keySeparator?: Value | undefined;
    /**
     * `nsSeparator: false` — a `:` in the key is not a namespace separator.
     */
    nsSeparator?: Value | undefined;
    /**
     * When present and an object, `replace` REPLACES the options as the
     * interpolation source (`i18next.js:1180`) — a top-level `v` is shadowed
     * rather than merged.
     */
    replace?: ReplaceArg | undefined;
    /**
     * Options i18next answers with a NON-string. A Rust `t()` is string-typed by
     * construction, so these are typed errors, not silent coercions.
     */
    returnObjects?: boolean | undefined;
    returnDetails?: boolean | undefined;
    joinArrays?: Value | undefined;
}

/**
 * The resolve state after a language change.
 */
export interface LanguageState {
    language: string;
    resolvedLanguage: string | undefined;
    languages: string[];
}

/**
 * `replace`, which when it is an object REPLACES the options as the
 * interpolation source (`i18next.js:1180`). Typed as a map of [`VarValue`] so a
 * non-finite value survives that route too — the 005 adapter deliberately routes
 * through `replace` when normalising an own-but-undefined `count`.
 */
export type ReplaceArg = Map<string, VarValue> | Value;

export interface AbiValue {
    kind: string;
    name: string;
    value: string;
    children: AbiValue[];
}

export interface CoreErrorJs {
    code: string;
    message: string;
}

export interface P256PublicKey {
    /**
     * 0x-hex, 32 bytes.
     */
    x: string;
    /**
     * 0x-hex, 32 bytes.
     */
    y: string;
}

export interface SafeAddressInfo {
    address: string;
    /**
     * 0x-hex, 32 bytes.
     */
    salt_nonce: string;
    /**
     * 0x-hex.
     */
    setup_data: string;
    /**
     * 0x-hex, 32 bytes.
     */
    init_code_hash: string;
}


/**
 * Creating a wallet: register → prove signing → derive → sync → save.
 */
export class CreateWalletCore {
    free(): void;
    [Symbol.dispose](): void;
    dispatch(event_json: string): string;
    constructor();
    resolve_effect(effect_id: bigint, result_json: string): string;
    view(): string;
}

/**
 * A translation engine.
 */
export class I18n {
    free(): void;
    [Symbol.dispose](): void;
    changeLanguage(lng: string): LanguageState;
    dir(): string;
    exists(key: string, opts?: any | null): boolean;
    language(): string;
    /**
     * Make `lang`'s catalog active — the on-demand load.
     */
    loadCatalog(lang: string, json: Uint8Array): void;
    /**
     * Build from the `en` fallback catalog, supplied as the bytes of
     * `/i18n/en.json`.
     */
    constructor(fallback_json: Uint8Array);
    /**
     * Build an engine pinned to the LEGACY plural rule — i18next's `dummyRule`,
     * which is what a host without `Intl.PluralRules` silently falls back to.
     * Exposed so the conformance corpus can replay MODE B here too; production
     * code should never call it.
     */
    static newWithLegacyPlurals(fallback_json: Uint8Array): I18n;
    /**
     * Release `lang` if it is the active catalog. `en` is never releasable.
     */
    releaseCatalog(lang: string): boolean;
    residentBytes(): number;
    residentLocales(): string[];
    /**
     * Resolve `key`. Returns the key itself when nothing matches.
     */
    t(key: string, opts?: any | null): string;
    /**
     * First key that resolves wins; all-missing returns the **last** key.
     */
    tFirst(keys: string[], opts?: any | null): string;
}

/**
 * Signing in with an existing passkey, including on-device recovery.
 */
export class LoginCore {
    free(): void;
    [Symbol.dispose](): void;
    dispatch(event_json: string): string;
    constructor();
    resolve_effect(effect_id: bigint, result_json: string): string;
    view(): string;
}

export function abiEncodeAddress(address_hex: string): Uint8Array;

export function abiEncodeBytes32(data: Uint8Array): Uint8Array;

export function abiEncodeUint256(value_hex: string): Uint8Array;

export function canonicalizeSignature(sig: string): string;

export function checksumAddress(address_hex: string): string;

export function computeSafeAddress(x: Uint8Array, y: Uint8Array): SafeAddressInfo;

export function computeSelector(sig: string): string;

export function computeSplitterAddress(treasury_hex: string): string;

export function create2Address(deployer_hex: string, salt: Uint8Array, init_code_hash: Uint8Array): string;

export function decodeCalldata(sig: string, calldata: Uint8Array): AbiValue;

export function derSignatureToRawLowS(der: Uint8Array): Uint8Array;

export function encodeSplitterDeployCall(treasury_hex: string): Uint8Array;

export function encodeType(typed_data_json: string): string;

export function extractAttestationPublicKey(attestation_object: Uint8Array): P256PublicKey;

export function fromBase64Url(s: string): Uint8Array;

export function fromHex(s: string): Uint8Array;

export function functionSelector(signature: string): Uint8Array;

export function hashTypedData(typed_data_json: string): Uint8Array;

/**
 * Interpolate a template in isolation, without a key lookup.
 */
export function i18nInterpolate(template: string, opts?: TOptions | null): string;

export function i18nPluralSuffix(locale: string, count: number): string;

export function i18nPluralSuffixLegacy(count: number): string;

export function i18nPluralSuffixes(locale: string): string[];

export function i18nPluralSuffixesLegacy(): string[];

export function i18nTextDirection(lng: string): string;

/**
 * Stock output as a `data:image/svg+xml;base64,…` URI.
 */
export function identiconDataUri(seed: string): string;

export function identiconMakeHash(seed: string): string;

/**
 * Case- and length-normalises a seed. Every platform must call this rather than
 * lowercasing locally — that is how the platforms drift apart.
 */
export function identiconNormalizeSeed(seed: string): string;

export function identiconParams(seed: string): IdenticonParams;

/**
 * The library's stock hexagonal output.
 */
export function identiconSvg(seed: string): string;

/**
 * **The wallet's identicon.** Circular variant, no SVG ids — several instances can
 * share one DOM without their clip paths colliding.
 */
export function identiconSvgCircular(seed: string): string;

export function keccak256(data: Uint8Array): Uint8Array;

export function matchSelector(sig: string, calldata: Uint8Array): boolean;

export function parsePublicKey(hex: string): P256PublicKey;

/**
 * Returns `null` when the two assertions do not pin down exactly one key
 * (different credentials, or the same signature twice) — that is a legitimate
 * outcome, not an error.
 */
export function recoverPublicKeyFromAssertions(a_authenticator_data: Uint8Array, a_client_data_json: Uint8Array, a_signature_der: Uint8Array, b_authenticator_data: Uint8Array, b_client_data_json: Uint8Array, b_signature_der: Uint8Array): P256PublicKey | undefined;

export function safeProxyRuntimeCode(): string;

export function sha256(data: Uint8Array): Uint8Array;

export function toBase64Url(data: Uint8Array): string;

export function toHex(data: Uint8Array, prefixed: boolean): string;

export function toQuantity(value: string): string;

/**
 * `kind` is `"create"` or `"get"` (anything else errors — the caller is
 * choosing which contract-mirrored rule set applies).
 */
export function validateClientData(kind: string, client_data_json: Uint8Array, authenticator_data: Uint8Array): void;

export function webauthnSigningHash(authenticator_data: Uint8Array, client_data_json: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_createwalletcore_free: (a: number, b: number) => void;
    readonly __wbg_i18n_free: (a: number, b: number) => void;
    readonly __wbg_logincore_free: (a: number, b: number) => void;
    readonly abiEncodeAddress: (a: number, b: number) => [number, number, number, number];
    readonly abiEncodeBytes32: (a: number, b: number) => [number, number, number, number];
    readonly abiEncodeUint256: (a: number, b: number) => [number, number, number, number];
    readonly canonicalizeSignature: (a: number, b: number) => [number, number, number, number];
    readonly checksumAddress: (a: number, b: number) => [number, number, number, number];
    readonly computeSafeAddress: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly computeSelector: (a: number, b: number) => [number, number, number, number];
    readonly computeSplitterAddress: (a: number, b: number) => [number, number, number, number];
    readonly create2Address: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly createwalletcore_dispatch: (a: number, b: number, c: number) => [number, number, number, number];
    readonly createwalletcore_new: () => number;
    readonly createwalletcore_resolve_effect: (a: number, b: bigint, c: number, d: number) => [number, number, number, number];
    readonly createwalletcore_view: (a: number) => [number, number, number, number];
    readonly decodeCalldata: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly derSignatureToRawLowS: (a: number, b: number) => [number, number, number, number];
    readonly encodeSplitterDeployCall: (a: number, b: number) => [number, number, number, number];
    readonly encodeType: (a: number, b: number) => [number, number, number, number];
    readonly extractAttestationPublicKey: (a: number, b: number) => [number, number, number];
    readonly fromBase64Url: (a: number, b: number) => [number, number, number, number];
    readonly fromHex: (a: number, b: number) => [number, number, number, number];
    readonly functionSelector: (a: number, b: number) => [number, number, number, number];
    readonly hashTypedData: (a: number, b: number) => [number, number, number, number];
    readonly i18nInterpolate: (a: number, b: number, c: number) => [number, number, number, number];
    readonly i18nPluralSuffix: (a: number, b: number, c: number) => [number, number];
    readonly i18nPluralSuffixLegacy: (a: number) => [number, number];
    readonly i18nPluralSuffixes: (a: number, b: number) => [number, number];
    readonly i18nPluralSuffixesLegacy: () => [number, number];
    readonly i18nTextDirection: (a: number, b: number) => [number, number];
    readonly i18n_changeLanguage: (a: number, b: number, c: number) => any;
    readonly i18n_dir: (a: number) => [number, number];
    readonly i18n_exists: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly i18n_language: (a: number) => [number, number];
    readonly i18n_loadCatalog: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly i18n_new: (a: number, b: number) => [number, number, number];
    readonly i18n_newWithLegacyPlurals: (a: number, b: number) => [number, number, number];
    readonly i18n_releaseCatalog: (a: number, b: number, c: number) => number;
    readonly i18n_residentBytes: (a: number) => number;
    readonly i18n_residentLocales: (a: number) => [number, number];
    readonly i18n_t: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly i18n_tFirst: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly identiconDataUri: (a: number, b: number) => [number, number, number, number];
    readonly identiconMakeHash: (a: number, b: number) => [number, number];
    readonly identiconNormalizeSeed: (a: number, b: number) => [number, number];
    readonly identiconParams: (a: number, b: number) => [number, number, number];
    readonly identiconSvg: (a: number, b: number) => [number, number, number, number];
    readonly identiconSvgCircular: (a: number, b: number) => [number, number, number, number];
    readonly keccak256: (a: number, b: number) => [number, number];
    readonly logincore_dispatch: (a: number, b: number, c: number) => [number, number, number, number];
    readonly logincore_new: () => number;
    readonly logincore_resolve_effect: (a: number, b: bigint, c: number, d: number) => [number, number, number, number];
    readonly logincore_view: (a: number) => [number, number, number, number];
    readonly matchSelector: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly parsePublicKey: (a: number, b: number) => [number, number, number];
    readonly recoverPublicKeyFromAssertions: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number) => [number, number, number];
    readonly safeProxyRuntimeCode: () => [number, number, number, number];
    readonly sha256: (a: number, b: number) => [number, number];
    readonly toBase64Url: (a: number, b: number) => [number, number];
    readonly toHex: (a: number, b: number, c: number) => [number, number];
    readonly toQuantity: (a: number, b: number) => [number, number, number, number];
    readonly validateClientData: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly webauthnSigningHash: (a: number, b: number, c: number, d: number) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
