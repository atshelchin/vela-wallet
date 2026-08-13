/**
 * The shapes the network-administration controllers return on every platform.
 *
 * A standalone module from the days this controller was a platform pair:
 * the pair could not import its own base file (Metro resolved it back to
 * the `.web.ts` half and recursed at module init), so both halves imported
 * from here. The pair is gone; the module stays as the one place the
 * contract the screens compile against is declared.
 *
 * Four controllers, one per surface the `network_admin` core serves:
 * the network editor (per-chain RPC/explorer overrides), the service-endpoint
 * editor, the add-network wizard, and the RPC-provider key manager.
 */

import type { Network } from '@/models/network';
import type { CompatibilityResult, ServiceEndpoints } from '@/models/types';
import type { ProviderId } from '@/services/rpc-providers';

/** A per-field health badge (the `EndpointHealth` the cards render today). */
export type EndpointHealth = { status: 'checking' | 'ok' | 'error'; latencyMs?: number };

/** A service-endpoint badge (`ServiceHealth`). `detail` is already worded copy. */
export type ServiceHealth = {
  status: 'checking' | 'ok' | 'not_https' | 'unreachable' | 'invalid_response';
  latencyMs?: number;
  detail?: string;
};

/**
 * A save the wallet refused because the RPC in the field proved it serves a
 * different chain (spec 017, `network_admin` invariant ④).
 *
 * Only ever set from a POSITIVE `eth_chainId` answer that disagreed. An
 * endpoint that timed out or refused the request is "unable to verify" and its
 * save goes through — the same rule the compatibility checker follows, where an
 * unreachable chain gets a Retry and never a condemnation.
 */
export interface RpcChainMismatch {
  /** The network being edited. */
  expectedChainId: number;
  /** What the endpoint said it serves. */
  reportedChainId: number;
}

/** One row of the network editor — the visual identity plus the editable state. */
export interface NetworkCardView {
  /** Icon/name/bundler identity. Presentation only; values below are authoritative. */
  network: Network;
  /** Custom networks get the delete affordance. */
  isCustom: boolean;
  /** Draft if the card was expanded, else the saved override, else the default. */
  rpcURL: string;
  explorerURL: string;
  /** `[rpc, explorer]`, in the order the two fields render. */
  healths: [EndpointHealth, EndpointHealth];
  /**
   * Set when the last blur was REFUSED: nothing was written and the previously
   * saved endpoint is still in use. Cleared by the next keystroke.
   *
   * `undefined` on native, where the TypeScript controller keeps its historic
   * save-without-a-gate behaviour (FR-202: native semantics unchanged).
   */
  rpcMismatch?: RpcChainMismatch;
}

export interface NetworkEditorController {
  cards: NetworkCardView[];
  /** The modal became visible. */
  open(): void;
  /** A card was expanded — seed its drafts and probe both fields. */
  expand(chainId: number): void;
  /** A card was collapsed. Re-expanding must probe again. */
  collapse(chainId: number): void;
  setRpcURL(chainId: number, value: string): void;
  setExplorerURL(chainId: number, value: string): void;
  /**
   * Field blur — persist the override and flush the caches.
   *
   * On web the write is gated on the RPC's own `eth_chainId` answer, so it can
   * be refused (`rpcMismatch`) or briefly deferred until that answer lands.
   */
  save(chainId: number): void;
  /** Delete a custom network (the confirm dialog belongs to the screen). */
  remove(id: string): void;
}

export interface EndpointFieldView {
  key: keyof ServiceEndpoints;
  value: string;
  health: ServiceHealth;
}

export interface ServiceEndpointsController {
  fields: EndpointFieldView[];
  /** The modal became visible — probe all four fields. */
  open(): void;
  setValue(key: keyof ServiceEndpoints, value: string): void;
  /** Field blur — clean, persist, flush pools, re-probe. */
  save(key: keyof ServiceEndpoints): void;
  /** The refresh affordance. */
  refresh(): void;
  resetToDefaults(): void;
}

/** What the wizard's result card renders. */
export interface WizardChainInfo {
  chainId: number;
  name: string;
  nativeSymbol: string;
  isTestnet: boolean;
}

export interface WizardSuggestion {
  chainId: number;
  name: string;
  nativeCurrencySymbol: string;
}

export interface AddNetworkController {
  query: string;
  suggestions: WizardSuggestion[];
  searching: boolean;
  loading: boolean;
  saving: boolean;
  /** Already-worded copy, byte-identical to the strings the modal showed. */
  error: string;
  chainInfo: WizardChainInfo | null;
  compat: CompatibilityResult | null;
  selectedChainId: number | null;
  customRpc: string;
  /**
   * The chain id of the most recent successful save. The modal closes on a
   * *change* of this value, which is how `handleAdd`'s `onAdded(); reset();
   * onClose();` tail survives the move into a controller. It is sticky (the web
   * core keeps it for the app's lifetime), so only transitions matter.
   */
  addedChainId: number | null;
  setQuery(text: string): void;
  setCustomRpc(value: string): void;
  select(chainId: number, keepCustomRpc?: boolean): void;
  add(): void;
  reset(): void;
}

export interface ProviderNetResult {
  chainId: number;
  ok: boolean;
  latencyMs: number;
}

export interface ProviderTestView {
  status: 'testing' | 'done';
  results: ProviderNetResult[];
}

export interface RpcProvidersController {
  /** Draft key per provider — controlled inputs. */
  keys: Partial<Record<ProviderId, string>>;
  tests: Partial<Record<ProviderId, ProviderTestView>>;
  /** The modal became visible — seed drafts and auto-test configured providers. */
  open(): void;
  setKey(id: ProviderId, value: string): void;
  /** Field blur — persist every draft and re-test this one. */
  blur(id: ProviderId): void;
  test(id: ProviderId): void;
}
