/**
 * Fiat exchange rates from Chainlink FX price feeds on Ethereum mainnet.
 * Ported from src/services/fiat-rates.ts @ c13e89d4 (AsyncStorage → the KV;
 * namehash from `services/ens`; info logs dropped, warnings kept).
 *
 * Source of truth: Chainlink `<ccy>-usd.data.eth` feeds resolved on-chain via
 * ENS, then read with `latestRoundData()`:
 *   feed answer = USD value of one unit of the fiat currency (<CCY>/USD)
 *   USD → fiat multiplier = 1 / answer
 * Feed decimals VARY (most 8, PHP 18), so `decimals()` is read per feed.
 *
 * Caching: resolved feed addresses persist 30d (the proxies are immutable);
 * the rate map is cached 5 min in memory and persisted for offline first-paint.
 */
import {
	MULTICALL3,
	decAggregate3,
	decChainlinkAnswer,
	decU8,
	encAggregate3,
	encDecimals,
	encLatestRound,
	type Call3
} from './abi';
import { namehash } from './ens';
import { poolRpcCall } from './rpc-pool';
import { getItem, setItem } from './storage';

/** Every fiat currency with a live `<ccy>-usd.data.eth` feed on mainnet (verified). */
export const FIAT_FEED_CODES = [
	'EUR',
	'GBP',
	'JPY',
	'CNY',
	'AUD',
	'CAD',
	'CHF',
	'KRW',
	'BRL',
	'MXN',
	'PHP',
	'SGD',
	'NZD',
	'TRY',
	'IDR',
	'ARS'
] as const;
const FIAT_FEED_SET = new Set<string>(FIAT_FEED_CODES);

/** Whether `code` has a Chainlink fiat/USD feed addressable via ENS on mainnet. */
export function isChainlinkFiat(code: string): boolean {
	return FIAT_FEED_SET.has(code.toUpperCase());
}

/** ENS name for a currency's Chainlink fiat feed, e.g. "gbp-usd.data.eth". */
export function feedEnsName(code: string): string {
	return `${code.toLowerCase()}-usd.data.eth`;
}

const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const SEL_RESOLVER = '0178b8bf'; // resolver(bytes32)
const SEL_ADDR = '3b3b57de'; // addr(bytes32)

/** Known-good feed addresses — a last resort when ENS resolution is unavailable. */
const FALLBACK_ADDRS: Record<string, string> = {
	EUR: '0xb49f677943BC038e9857d61E7d053CaA2C1734C1',
	GBP: '0x5c0Ab2d9b5a7ed9f470386e82BB36A3613cDd4b5',
	JPY: '0xBcE206caE7f0ec07b545EddE332A47C2F75bbeb3',
	CNY: '0xeF8A4aF35cd47424672E3C590aBD37FBB7A7759a',
	AUD: '0x77F9710E7d0A19669A13c055F62cd80d313dF022',
	CAD: '0xa34317DB73e77d453b1B8d04550c44D10e981C8e',
	CHF: '0x449d117117838fFA61263B61dA6301AA2a88B13A',
	KRW: '0x01435677FB11763550905594A16B645847C1d0F3',
	BRL: '0x3126E7F38D5f60f4E2B6ec3511C7bdbD79317Df1',
	MXN: '0xdb4881Ab0ad6b8423f76dd8C9d65542749a1dB77',
	PHP: '0x3C7dB4D25deAb7c89660512C5494Dc9A3FC40f78',
	SGD: '0xe25277fF4bbF9081C75Ab0EB13B4A13a721f3E13',
	NZD: '0x3977CFc9e4f29C184D4675f4EB8e0013236e5f3e',
	TRY: '0xB09fC5fD3f11Cf9eb5E1C5Dba43114e3C9f477b5',
	IDR: '0x91b99C9b75aF469a71eE1AB528e8da994A5D7030',
	ARS: '0xE41cD2DcC63EB63A9D9e62f2a3D9b49e6d0C0A1d'
};

function wordToAddr(hex: string): string | null {
	const d = hex.startsWith('0x') ? hex.slice(2) : hex;
	if (d.length < 64) return null;
	return '0x' + d.slice(24, 64);
}

function isZeroAddr(a: string): boolean {
	return /^0x0*$/.test(a);
}

const ADDR_CACHE_KEY = 'vela.fiatFeedAddrs.v1';
const ADDR_TTL = 30 * 24 * 60 * 60 * 1000;
const RATE_CACHE_KEY = 'vela.fiatRates.v1';
const RATE_TTL = 5 * 60 * 1000;

let _addrs: Record<string, string> | null = null;
let _rateCache: { rates: Record<string, number>; at: number } | null = null;
let _inflight: Promise<Record<string, number>> | null = null;

/**
 * Resolve every supported feed's ENS name to its address: two multicalls on
 * mainnet (registry.resolver(node), then resolver.addr(node)). Cached in
 * memory + KV; falls back to the known addresses on failure.
 */
async function resolveFeedAddresses(): Promise<Record<string, string>> {
	if (_addrs) return _addrs;

	try {
		const raw = await getItem(ADDR_CACHE_KEY);
		if (raw) {
			const c = JSON.parse(raw) as { addrs: Record<string, string>; at: number };
			if (c.addrs && Object.keys(c.addrs).length && Date.now() - c.at < ADDR_TTL) {
				_addrs = c.addrs;
				return _addrs;
			}
		}
	} catch {
		/* re-resolve below */
	}

	const codes = [...FIAT_FEED_CODES];
	const nodes = codes.map((c) => namehash(feedEnsName(c)));

	try {
		const resolverCalls: Call3[] = nodes.map((node) => ({
			target: ENS_REGISTRY,
			allowFailure: true,
			callData: '0x' + SEL_RESOLVER + node.slice(2)
		}));
		const resolvers = decAggregate3(await ethCall(MULTICALL3, encAggregate3(resolverCalls))).map(
			(r) => (r.success ? wordToAddr(r.data) : null)
		);

		const addrCalls: Call3[] = [];
		const codeForCall: string[] = [];
		resolvers.forEach((res, i) => {
			if (res && !isZeroAddr(res)) {
				addrCalls.push({
					target: res,
					allowFailure: true,
					callData: '0x' + SEL_ADDR + nodes[i].slice(2)
				});
				codeForCall.push(codes[i]);
			}
		});

		const out: Record<string, string> = {};
		if (addrCalls.length) {
			const addrRes = decAggregate3(await ethCall(MULTICALL3, encAggregate3(addrCalls)));
			addrRes.forEach((r, j) => {
				if (!r.success) return;
				const a = wordToAddr(r.data);
				if (a && !isZeroAddr(a)) out[codeForCall[j]] = a;
			});
		}

		if (Object.keys(out).length) {
			_addrs = out;
			setItem(ADDR_CACHE_KEY, JSON.stringify({ addrs: out, at: Date.now() })).catch(() => {});
			return out;
		}
	} catch (err) {
		console.warn(
			`[FiatRates] ENS resolution failed: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	_addrs = { ...FALLBACK_ADDRS };
	return _addrs;
}

/** USD → fiat multipliers for all supported currencies in one multicall. Cached 5 min. */
export async function fetchFiatRates(): Promise<Record<string, number>> {
	if (_rateCache && Date.now() - _rateCache.at < RATE_TTL) return _rateCache.rates;
	if (_inflight) return _inflight;

	_inflight = (async () => {
		try {
			const addrs = await resolveFeedAddresses();
			const codes = Object.keys(addrs);
			if (!codes.length) return await loadPersistedRates();

			const calls: Call3[] = [];
			for (const c of codes) {
				calls.push({ target: addrs[c], allowFailure: true, callData: encLatestRound() });
				calls.push({ target: addrs[c], allowFailure: true, callData: encDecimals() });
			}
			const res = decAggregate3(await ethCall(MULTICALL3, encAggregate3(calls)));

			const rates: Record<string, number> = {};
			for (let i = 0; i < codes.length; i++) {
				const roundR = res[i * 2];
				const decR = res[i * 2 + 1];
				if (!roundR?.success) continue;
				const answer = decChainlinkAnswer(roundR.data);
				if (answer <= 0n) continue;
				const decimals = decR?.success ? decU8(decR.data) : 8;
				const usdPerUnit = Number(answer) / 10 ** decimals; // <CCY>/USD
				if (usdPerUnit > 0) rates[codes[i]] = 1 / usdPerUnit; // USD → fiat
			}

			if (Object.keys(rates).length) {
				_rateCache = { rates, at: Date.now() };
				setItem(RATE_CACHE_KEY, JSON.stringify(_rateCache)).catch(() => {});
				return rates;
			}
			return await loadPersistedRates();
		} catch (err) {
			console.warn(`[FiatRates] fetch failed: ${err instanceof Error ? err.message : String(err)}`);
			return await loadPersistedRates();
		} finally {
			_inflight = null;
		}
	})();

	return _inflight;
}

/** USD → fiat multiplier for a single Chainlink-supported currency, or null. */
export async function getChainlinkRate(code: string): Promise<number | null> {
	if (!isChainlinkFiat(code)) return null;
	const rates = await fetchFiatRates();
	const r = rates[code.toUpperCase()];
	return r && r > 0 ? r : null;
}

async function loadPersistedRates(): Promise<Record<string, number>> {
	if (_rateCache) return _rateCache.rates;
	try {
		const raw = await getItem(RATE_CACHE_KEY);
		if (raw) {
			const c = JSON.parse(raw) as { rates: Record<string, number>; at: number };
			if (c?.rates) {
				_rateCache = c;
				return c.rates;
			}
		}
	} catch {
		/* ignore */
	}
	return {};
}

async function ethCall(to: string, data: string): Promise<string> {
	const r = await poolRpcCall('eth_call', [{ to, data }, 'latest'], 1);
	if (r.error) throw new Error(r.error.message);
	if (typeof r.result !== 'string' || r.result === '0x') throw new Error('empty result');
	return r.result;
}
