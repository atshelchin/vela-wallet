/**
 * The send flow's live overlays (spec 026 T233).
 *
 * Siblings of the fixture builders, exactly as 025's are: the drawn models
 * keep their shape, and every field below is filled from `SendView` /
 * `FeeView` — the core's. Nothing here decides anything. The amounts are the
 * core's strings, the gate is `can_continue` / `can_confirm`, the stage is
 * `stage`, and the words are the corpus's.
 *
 * What this file DOES own is wording and formatting: which template a value
 * goes into, and how a fee reads as "0.0021 ETH · ≈$0.55". That is the same
 * division 025 drew for the home.
 */
import type { CurrencyView } from '$lib/core/generated/CurrencyView';
import type { FeeEstimateView } from '$lib/core/generated/FeeEstimateView';
import type { FeeView } from '$lib/core/generated/FeeView';
import type { SendToken } from '$lib/core/generated/SendToken';
import type { SendView } from '$lib/core/generated/SendView';
import { chainName, nativeSymbol } from '$lib/services/networks';
import { chainColor } from '$lib/wallet/fixtures';
import type { WalletIdentity } from '$lib/wallet/identity';
import { shortenAddress } from '$lib/wallet/identity';
import { moneyText, trimBalance } from '$lib/wallet/live';
import { fill } from '$lib/wallet/messages';
import type { WalletFlowMessages } from './messages';
import type {
	FactRowModel,
	FeeRowModel,
	FeeTokenPickModel,
	SendConfirmModel,
	SendFormModel,
	SendPickModel,
	SendReceiptModel,
	TokenMarkModel
} from './model';
import type { AssetRowModel } from '$lib/wallet/model';

export interface SendLiveInputs {
	send: SendView;
	fee: FeeView;
	m: WalletFlowMessages;
	currency: CurrencyView;
	identity: WalletIdentity;
	identicon: (seed: string) => string;
	locale?: string;
}

// ---------------------------------------------------------------------------
// Shared wording
// ---------------------------------------------------------------------------

function mark(token: SendToken): TokenMarkModel {
	return { ticker: token.symbol, badgeColor: chainColor(token.chain_id) };
}

/** A token row for the picker: the balance the core carries, priced by it too. */
function tokenRow(token: SendToken, currency: CurrencyView): AssetRowModel {
	return {
		ticker: token.symbol,
		chain: chainName(token.chain_id),
		badgeColor: chainColor(token.chain_id),
		balance: trimBalance(token.balance),
		fiat:
			token.price_usd === null
				? { kind: 'no-price', text: '—' }
				: {
						kind: 'value',
						text: moneyText((parseFloat(token.balance) || 0) * token.price_usd, currency)
					},
		masked: false
	};
}

/**
 * A settled estimate as one line: the fee coin's amount and its fiat value.
 * `null` while the quote is in flight — the drawn row shows the label alone
 * rather than a number nobody has agreed to yet.
 */
function feeText(fee: FeeEstimateView | null): string {
	if (!fee) return '—';
	const asset = fee.fee_asset;
	if (asset.type === 'erc20') {
		const amount = Number(asset.amount) / 10 ** asset.decimals;
		return `${trimBalance(amount.toString(), 4)} ${asset.symbol ?? ''}`.trim();
	}
	const wei = Number(fee.total_wei) / 1e18;
	const symbol = nativeSymbol(fee.chain_id);
	return `${trimBalance(wei.toString(), 6)} ${symbol}`;
}

function feeRow(inputs: SendLiveInputs, template: FeeRowModel): FeeRowModel {
	const { send, fee, m } = inputs;
	const quote = send.fee ?? fee.fee;
	const chainId = send.selected_token?.chain_id ?? quote?.chain_id ?? 1;
	const symbol =
		quote?.fee_asset.type === 'erc20'
			? (quote.fee_asset.symbol ?? nativeSymbol(chainId))
			: nativeSymbol(chainId);
	return {
		label: m['componentsUi.gas.networkFee'],
		mark: { ticker: symbol, badgeColor: chainColor(chainId) },
		value: send.fee_busy || fee.busy ? '…' : feeText(quote),
		openLabel: template.openLabel
	};
}

// ---------------------------------------------------------------------------
// The screens
// ---------------------------------------------------------------------------

/** SD1 — which token to send. The rows are the core's holdings, not a fixture's. */
export function liveSendPick(model: SendPickModel, inputs: SendLiveInputs): SendPickModel {
	const { send, currency } = inputs;
	return {
		...model,
		notice: undefined,
		selection: undefined,
		rows: send.tokens.map((token) => tokenRow(token, currency))
	};
}

/** SD2 — recipient and amount. */
export function liveSendForm(model: SendFormModel, inputs: SendLiveInputs): SendFormModel {
	const { send, m, currency, identicon } = inputs;
	const token = send.selected_token;
	const usd =
		token?.price_usd != null ? (parseFloat(send.token_amount) || 0) * token.price_usd : null;

	return {
		...model,
		mode: 'single',
		header: {
			...model.header,
			title: token ? fill(m['send.sendTitle'], { symbol: token.symbol }) : model.header.title
		},
		token: token
			? {
					mark: mark(token),
					symbol: token.symbol,
					detail: `${chainName(token.chain_id)} · ${fill(m['send.balanceLabel'], {
						amount: trimBalance(token.balance)
					})}`,
					max: m['send.maxBtn']
				}
			: model.token,
		amount: {
			value: send.amount || '0',
			fiat: usd === null ? '' : `≈ ${moneyText(usd, currency)}`,
			denomLabel: send.amount_fiat_code ?? token?.symbol ?? ''
		},
		recipient: {
			label: m['send.recipientLabel'],
			lines: recipientLines(send),
			identiconSvg: send.recipient ? identicon(send.recipient) : '',
			pickLabel: m['send.recipientPickAria'],
			scanLabel: m['send.scanAria'],
			// The trust line the core resolved: a name when it knows one, and the
			// first-interaction note when it does not.
			note: recipientNote(send, m)
		},
		addRecipient: undefined,
		recipients: undefined,
		recipientActions: undefined,
		summary: undefined,
		fee: feeRow(inputs, model.fee),
		cta: m['send.continueBtn']
	};
}

/** The address, split across the drawn two lines. Empty reads as the placeholder. */
function recipientLines(send: SendView): [string, string] {
	const address = send.recipient;
	if (!address) return ['', ''];
	const half = Math.ceil(address.length / 2);
	return [address.slice(0, half), address.slice(half)];
}

function recipientNote(send: SendView, m: WalletFlowMessages): string | undefined {
	const identity = send.recipient_identity;
	if (identity?.name) {
		return identity.source ? `${identity.name} · ${identity.source}` : identity.name;
	}
	// The core's own verdict, in the corpus's words. A contract recipient has
	// no send-screen sentence written for it yet (recorded); the first-time
	// tell does, and it is the one that matters for a poisoned look-alike.
	if (send.recipient_risk?.first_time === true) return m['componentsUi.signing.firstTimeTag'];
	return undefined;
}

/** SD3 — the confirm screen: what is about to be signed. */
export function liveSendConfirm(model: SendConfirmModel, inputs: SendLiveInputs): SendConfirmModel {
	const { send, m, currency, identity, identicon } = inputs;
	const token = send.selected_token;
	const usd =
		token?.price_usd != null ? (parseFloat(send.confirm_amount) || 0) * token.price_usd : null;
	const chainId = token?.chain_id ?? 1;

	const facts: FactRowModel[] = [
		{
			label: m['send.fromLabel'],
			value: identity.name,
			lead: { kind: 'identicon', svg: identicon(identity.address) }
		},
		{
			label: m['send.toLabel'],
			value: send.recipient_identity?.name ?? shortenAddress(send.recipient),
			lead: { kind: 'identicon', svg: identicon(send.recipient) },
			mono: send.recipient_identity?.name == null
		},
		{
			label: m['componentsTx.detail.labelChain'],
			value: chainName(chainId),
			lead: {
				kind: 'token',
				mark: { ticker: nativeSymbol(chainId), badgeColor: chainColor(chainId) }
			}
		},
		{
			label: m['send.estFeeLabel'],
			value: feeText(send.fee ?? inputs.fee.fee)
		}
	];

	return {
		...model,
		amount: `${send.confirm_amount} ${token?.symbol ?? ''}`.trim(),
		subline: usd === null ? '' : `≈ ${moneyText(usd, currency)}`,
		facts,
		breakdown: undefined,
		cta: m['send.confirmSendBtn']
	};
}

/**
 * SD4 — the receipt.
 *
 * The stage is the CORE's, and it comes from `receipt.status`, not from
 * `tx_status`: the core flips `tx_status` to `confirmed` the moment the
 * signature is a fact (that is what "the send screen is done" means to it),
 * while the receipt's own status is what tracks the chain — `submitted` until
 * a hash lands, `confirmed` when one does, `failed` only on a definitive
 * verdict. Reading the wrong one would tell a person their money had arrived
 * while it was still in the air.
 */
export function liveSendReceipt(model: SendReceiptModel, inputs: SendLiveInputs): SendReceiptModel {
	const { send, m } = inputs;
	const token = send.selected_token;
	const chainId = token?.chain_id ?? 1;
	const header = {
		...model.header,
		title: token ? fill(m['send.sendTitle'], { symbol: token.symbol }) : model.header.title
	};
	const to = send.recipient_identity?.name ?? shortenAddress(send.recipient);
	const status = send.receipt?.status;

	if (status === 'failed' || send.tx_status === 'error') {
		return {
			...model,
			header,
			stage: 'failed',
			// The core chose the key; the shell only reads it out of the corpus.
			title: m['send.txErrorGeneric'],
			captions: [],
			hash: undefined,
			cta: m['componentsTx.receipt.done'],
			ctaAccent: false
		};
	}

	if (status === 'confirmed') {
		return {
			...model,
			header,
			stage: 'confirmed',
			title: fill(m['send.txConfirmedTitle'], {
				amount: send.receipt?.amount ?? send.confirm_amount,
				symbol: token?.symbol ?? ''
			}),
			captions: [`${fill(m['history.toName'], { name: to })} · ${chainName(chainId)}`],
			hash: send.tx_hash
				? {
						label: m['componentsTx.receipt.txHash'],
						value: send.tx_hash,
						copyLabel: m['componentsUi.identiconViewer.copyAddress']
					}
				: undefined,
			cta: m['componentsTx.receipt.done'],
			ctaAccent: true
		};
	}

	if (status === 'submitted') {
		return {
			...model,
			header,
			stage: 'submitted',
			title: m['send.txSubmittedTitle'],
			captions: [m['send.txWaitingConfirm']],
			hash: send.user_op_hash
				? {
						label: m['componentsTx.receipt.txHash'],
						value: send.tx_hash ?? send.user_op_hash,
						copyLabel: m['componentsUi.identiconViewer.copyAddress']
					}
				: undefined,
			cta: m['send.txCloseBackground'],
			ctaAccent: false
		};
	}

	// Signing or submitting: nothing has been accepted yet.
	return {
		...model,
		header,
		stage: 'submitting',
		title: m['send.txSubmitting'],
		captions: [m['send.txPreparingBiometric'], m['send.txBackgroundHint']],
		hash: undefined,
		cta: m['send.txCloseBackground'],
		ctaAccent: false
	};
}

/**
 * SD2f — the fee coin sheet.
 *
 * Every row the relay published, including the ones that cannot pay: which is
 * spendable is `insufficient`, the core's verdict, and hiding a row here would
 * be a second filter beside the core's own.
 */
export function liveFeeTokenPick(
	model: FeeTokenPickModel,
	inputs: SendLiveInputs
): FeeTokenPickModel {
	const { fee, send, m } = inputs;
	const chainId = send.selected_token?.chain_id ?? 1;
	return {
		...model,
		rows: fee.options.map((option) => ({
			mark: { ticker: option.symbol, badgeColor: chainColor(chainId) },
			symbol: option.symbol,
			balanceLabel: fill(m['send.balanceLabel'], {
				amount: trimBalance((Number(option.balance) / 10 ** option.decimals).toString(), 4)
			}),
			fee:
				option.amount === null
					? '—'
					: `~${trimBalance((Number(option.amount) / 10 ** option.decimals).toString(), 4)} ${option.symbol}`,
			selected: option.selected
		}))
	};
}
