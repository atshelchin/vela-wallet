/* tslint:disable */
/* eslint-disable */
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
    readonly abiEncodeAddress: (a: number, b: number) => [number, number, number, number];
    readonly abiEncodeBytes32: (a: number, b: number) => [number, number, number, number];
    readonly abiEncodeUint256: (a: number, b: number) => [number, number, number, number];
    readonly canonicalizeSignature: (a: number, b: number) => [number, number, number, number];
    readonly checksumAddress: (a: number, b: number) => [number, number, number, number];
    readonly computeSafeAddress: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly computeSelector: (a: number, b: number) => [number, number, number, number];
    readonly computeSplitterAddress: (a: number, b: number) => [number, number, number, number];
    readonly create2Address: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly decodeCalldata: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly derSignatureToRawLowS: (a: number, b: number) => [number, number, number, number];
    readonly encodeSplitterDeployCall: (a: number, b: number) => [number, number, number, number];
    readonly encodeType: (a: number, b: number) => [number, number, number, number];
    readonly extractAttestationPublicKey: (a: number, b: number) => [number, number, number];
    readonly fromBase64Url: (a: number, b: number) => [number, number, number, number];
    readonly fromHex: (a: number, b: number) => [number, number, number, number];
    readonly functionSelector: (a: number, b: number) => [number, number, number, number];
    readonly hashTypedData: (a: number, b: number) => [number, number, number, number];
    readonly identiconDataUri: (a: number, b: number) => [number, number, number, number];
    readonly identiconMakeHash: (a: number, b: number) => [number, number];
    readonly identiconNormalizeSeed: (a: number, b: number) => [number, number];
    readonly identiconParams: (a: number, b: number) => [number, number, number];
    readonly identiconSvg: (a: number, b: number) => [number, number, number, number];
    readonly identiconSvgCircular: (a: number, b: number) => [number, number, number, number];
    readonly keccak256: (a: number, b: number) => [number, number];
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
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
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
