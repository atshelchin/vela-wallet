import React, { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { useOnboardingLogin } from '@/hooks/use-onboarding-login';
import { CreateWalletScreen } from './CreateWalletScreen';
import { WelcomeScreen, OnboardingSettingsModal } from './WelcomeScreen';

type Step = 'welcome' | 'create';

interface OnboardingScreenProps {
  /** Embedded flows (for example the HTTPS dApp popup) can finish onboarding
   * without navigating away and continue the request that brought the user here. */
  onComplete?: () => void;
}

/**
 * Onboarding shell: which step is showing, and whether the endpoint settings
 * sheet is open. Nothing else.
 *
 * Sign-in, recovery and the index reachability probe all belong to the
 * controller (`use-onboarding-login`) — on web the portable Rust state machine,
 * on native today's TypeScript path.
 */
export default function OnboardingScreen({ onComplete }: OnboardingScreenProps = {}) {
  // Deep-link: /onboarding?mode=create jumps straight to the create form.
  // Any other value (or none, incl. ?mode=signin) stays on the welcome screen,
  // which has the "I already have a wallet" sign-in button.
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [step, setStep] = useState<Step>(mode === 'create' ? 'create' : 'welcome');
  const [showSettings, setShowSettings] = useState(false);
  const login = useOnboardingLogin({ onComplete });

  const openSettings = () => setShowSettings(true);

  if (step === 'create') {
    return (
      <>
        <CreateWalletScreen
          onBack={() => setStep('welcome')}
          onCreated={onComplete}
          onOpenSettings={openSettings}
        />
        <OnboardingSettingsModal
          visible={showSettings}
          onClose={() => setShowSettings(false)}
          unreachable={login.endpointUnreachable}
        />
      </>
    );
  }

  return (
    <>
      <WelcomeScreen
        onCreateWallet={() => setStep('create')}
        onLogin={login.signIn}
        loginLoading={login.busy}
        onOpenSettings={openSettings}
        autoShowSettings={login.endpointUnreachable}
      />
      <OnboardingSettingsModal
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        unreachable={login.endpointUnreachable}
      />
    </>
  );
}
