import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useSessionRoute } from '@/hooks/use-session-route';
import { color, createStyles } from '@/constants/theme';

export default function Index() {
  // The session decides what is ALLOWED; this screen only performs it
  // (spec 017 invariant ⑧). `loading` is not "no wallet" — it means storage is
  // unread and NO redirect judgment may be made yet.
  const route = useSessionRoute();

  if (route === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={color.accent.base} />
      </View>
    );
  }

  if (route === 'wallet') {
    return <Redirect href="/(tabs)/wallet" />;
  }
  return <Redirect href="/onboarding" />;
}

const styles = createStyles(() => ({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.bg.base,
  },
}));
