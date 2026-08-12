/**
 * Production wrapper — wires the dApp connection context to <SigningSheet>.
 */
import React from 'react';
import { AppModal } from '@/components/ui/AppModal';
import { useDAppConnection } from '@/models/dapp-connection';
import { useWallet } from '@/models/wallet-state';
import { BundlerFundingView } from '@/components/ui/BundlerFundingModal';
import { requestChainId as reqChainId, requestDApp } from '@/models/dapp-request-routing';
import { performSwipeDismiss } from './swipe-dismiss';
import { SigningSheet } from './SigningSheet';

export function SigningRequestModal() {
  const {
    incomingRequest, isSigning, isSubmitting, signError, pendingOpHash, chainId, dappInfo,
    confirmGateOpen,
    approveRequest, rejectRequest, dismissRequest,
    fundingNeeded, handleFundingComplete, handleFundingCancel,
  } = useDAppConnection();
  const { activeAccount } = useWallet();

  // Swipe-dismiss routing. What a swipe MEANS is a rule, not a rendering
  // decision, so it does not live in this file: on web the `sign_request` core
  // routes it (`SignEvent::SwipeDismissed`), on native `swipe-dismiss.ts` holds
  // the documented port. Both answer the same three questions this component
  // only supplies the facts for. Declared above the early return so the hook
  // order is unconditional.
  const onSwipeDismiss = React.useCallback(
    () =>
      performSwipeDismiss(
        {
          fundingNeeded: !!fundingNeeded,
          signError: !!signError,
          pendingOpHash: !!pendingOpHash,
          isSubmitting,
        },
        { reject: rejectRequest, dismiss: dismissRequest, fundingCancel: handleFundingCancel },
      ),
    [
      fundingNeeded, signError, pendingOpHash, isSubmitting,
      rejectRequest, dismissRequest, handleFundingCancel,
    ],
  );

  if (!incomingRequest) return null;

  return (
    // A single native sheet. When the gas account needs funding we SWAP the
    // sheet's content to the funding view instead of stacking a second AppModal
    // over it — iOS won't present a second native modal atop a presented one, so
    // a stacked funding modal was invisible and tapping Approve did nothing
    // (docs/KNOWN-BUGS.md BUG-1). Swipe-to-dismiss over the funding view cancels
    // the pending request (handleFundingCancel), matching the funding "取消".
    //
    // Swipe-dismiss routing: once submitting (isSubmitting) or already submitted
    // (pendingOpHash), the tx is committed → DISMISS (op proceeds, real result
    // delivered), never reject — a "cancelled" tx must not still broadcast + send a
    // contradictory success (BUG-2). Only a pre-submit swipe rejects (4001).
    // That verdict is `onSwipeDismiss` above; this file does not re-derive it.
    <AppModal
      visible={true}
      onClose={onSwipeDismiss}
    >
      {fundingNeeded ? (
        <BundlerFundingView
          funding={fundingNeeded}
          onFunded={handleFundingComplete}
          onCancel={handleFundingCancel}
          dappVariant
        />
      ) : (
        /* Per-request chain/identity for a Safari-extension sign (F3/F4): sign +
           display against the ORIGIN's granted chain and identity, never a
           concurrent WalletPair session's global chainId/dappInfo. Ordinary
           requests carry no __chainId/__dapp → fall back to the global state. */
        <SigningSheet
          request={incomingRequest}
          chainId={reqChainId(incomingRequest, chainId)}
          account={activeAccount ?? null}
          dappInfo={requestDApp(incomingRequest, dappInfo)}
          isSigning={isSigning}
          signError={signError}
          pendingOpHash={pendingOpHash}
          confirmGateOpen={confirmGateOpen}
          onApprove={approveRequest}
          onReject={rejectRequest}
          onDismiss={dismissRequest}
        />
      )}
    </AppModal>
  );
}
