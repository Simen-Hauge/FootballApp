import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import { useAuth } from '@/auth/AuthContext';
import { requestSignInCode, verifySignInCode } from '@/api/players';
import { ApiError } from '@/api/client';

type Stage = 'email' | 'code';

const RESEND_COOLDOWN_SECONDS = 30;

export default function AuthScreen() {
  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const router = useRouter();
  const { signIn: storeSession } = useAuth();

  // Resend cooldown ticker.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (resendIn <= 0) return;
    timerRef.current = setInterval(() => {
      setResendIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resendIn]);

  const submitEmail = async () => {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    setSubmitting(true);
    try {
      await requestSignInCode(trimmed);
      setStage('code');
      setCode('');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCode = async () => {
    setError(null);
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setSubmitting(true);
    try {
      const session = await verifySignInCode(email.trim().toLowerCase(), trimmed);
      await storeSession(session);
      router.replace('/(tabs)');
    } catch (e) {
      setError(humanize(e));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    if (resendIn > 0 || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestSignInCode(email.trim().toLowerCase());
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setSubmitting(false);
    }
  };

  const useDifferentEmail = () => {
    setStage('email');
    setCode('');
    setError(null);
    setResendIn(0);
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.hero}>
          <Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="cover"
            accessibilityLabel="FootyGuru"
          />
          <Text variant="display" style={styles.headline}>
            Predict the{'\n'}beautiful game.
          </Text>
          <Text variant="body" color="secondary" style={styles.sub}>
            Pick scores, climb your group leaderboard, earn bragging rights.
          </Text>
        </View>

        <Card style={styles.formCard}>
          {stage === 'email' ? (
            <>
              <View style={styles.stageHeader}>
                <Text variant="h3">Sign in</Text>
                <Text variant="small" color="muted">
                  Enter your email and we'll send you a 6-digit code.
                </Text>
              </View>
              <Input
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                returnKeyType="done"
                onSubmitEditing={submitEmail}
              />
              {error ? (
                <View style={styles.errorBox}>
                  <Text variant="small" color="danger">{error}</Text>
                </View>
              ) : null}
              <Button label="Send code" onPress={submitEmail} loading={submitting} size="lg" />
            </>
          ) : (
            <>
              <View style={styles.stageHeader}>
                <Text variant="h3">Enter your code</Text>
                <Text variant="small" color="muted">
                  We emailed a 6-digit code to{' '}
                  <Text variant="small" color="primary">{email.trim().toLowerCase()}</Text>.
                </Text>
              </View>
              <Input
                label="Verification code"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder="000000"
                maxLength={6}
                returnKeyType="done"
                onSubmitEditing={submitCode}
                style={styles.codeInput}
              />
              {error ? (
                <View style={styles.errorBox}>
                  <Text variant="small" color="danger">{error}</Text>
                </View>
              ) : null}
              <Button label="Verify" onPress={submitCode} loading={submitting} size="lg" />

              <View style={styles.actionsRow}>
                <Pressable onPress={resend} disabled={resendIn > 0 || submitting} hitSlop={6}>
                  <Text variant="small" color={resendIn > 0 || submitting ? 'muted' : 'brand'}>
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </Text>
                </Pressable>
                <Pressable onPress={useDifferentEmail} hitSlop={6}>
                  <Text variant="small" color="brand">Use a different email</Text>
                </Pressable>
              </View>
            </>
          )}
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function humanize(e: unknown): string {
  if (e instanceof ApiError) {
    // Server already returns user-friendly messages for these endpoints.
    return e.message || 'Something went wrong. Try again.';
  }
  return (e as Error).message || 'Something went wrong. Try again.';
}

const styles = StyleSheet.create({
  hero: { marginTop: spacing.xl, marginBottom: spacing.xl, gap: spacing.sm },
  logo: {
    width: 88,
    height: 88,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
  },
  headline: { marginTop: spacing.xs },
  sub: { marginTop: spacing.xs, lineHeight: 22 },
  formCard: { gap: spacing.lg },
  stageHeader: { gap: spacing.xs },
  codeInput: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 12,
    textAlign: 'center',
    color: colors.brand.primary,
    fontVariant: ['tabular-nums'],
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  errorBox: {
    backgroundColor: colors.state.dangerBg,
    padding: spacing.md,
    borderRadius: 10,
  },
});
