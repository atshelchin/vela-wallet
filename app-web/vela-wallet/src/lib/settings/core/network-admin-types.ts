// Ported from src/services/wallet-state-core/network-admin-types.ts @ e78afdfa
// (spec 024). One module per machine keeps integration waves off each other's
// files; the generic options shape lives in $lib/core/types.

import type { NetOperation } from '$lib/core/generated/NetOperation';
import type { NetView } from '$lib/core/generated/NetView';
import type { SessionOptions } from '$lib/core/types';

/** One request from the core, carrying the id it will be answered by. */
export type NetEffect = { id: number; operation: NetOperation };

export type NetworkAdminSessionOptions = SessionOptions<NetView>;
