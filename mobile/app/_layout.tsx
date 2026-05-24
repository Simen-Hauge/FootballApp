import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/auth/AuthContext';
import { GamemodeProvider } from '@/gamemode';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { colors, typography } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface.background }}>
      <SafeAreaProvider>
        <AuthProvider>
          <GamemodeProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.surface.background },
                animation: 'slide_from_right',
                headerLeft: () => <HeaderBackButton />,
                headerBackVisible: false,
                headerStyle: { backgroundColor: colors.surface.card },
                headerShadowVisible: false,
                headerTitleStyle: { ...typography.bodyBold, color: colors.text.primary },
                headerTintColor: colors.text.primary,
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="auth" options={{ animation: 'fade' }} />
              <Stack.Screen name="predictions" options={{ headerShown: true, title: 'My predictions' }} />
              <Stack.Screen name="matchday" options={{ presentation: 'card', headerShown: true, title: 'Matchday' }} />
              <Stack.Screen name="match/[id]" options={{ headerShown: true, title: 'Predict match' }} />
              <Stack.Screen name="scoreboard" options={{ headerShown: true, title: 'Scoreboard' }} />
              <Stack.Screen name="group/[id]" options={{ headerShown: true, title: 'Group' }} />
              <Stack.Screen name="group/create" options={{ headerShown: true, title: 'Create group' }} />
              <Stack.Screen name="group/join" options={{ headerShown: true, title: 'Join group' }} />
              <Stack.Screen name="group/settings" options={{ headerShown: true, title: 'Group settings' }} />
              <Stack.Screen name="wc/group-stage" options={{ headerShown: true, title: 'Group predictions' }} />
            </Stack>
          </GamemodeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
