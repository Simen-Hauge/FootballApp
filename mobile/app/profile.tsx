import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { updateProfile, updatePassword, deleteAccount } from '@/api/players';
import { ApiError } from '@/api/client';
import { colors, radii, spacing } from '@/theme';
import type { Session } from '@/auth/session';

export default function ProfileScreen() {
  const router = useRouter();
  const { session, updateSession, signOut } = useAuth();

  if (!session) {
    return (
      <Screen>
        <Card><Text variant="body" color="danger">Not signed in.</Text></Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text variant="display" color="inverse">{session.name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text variant="h2">{session.name}</Text>
        <Text variant="small" color="muted">{session.email}</Text>
      </View>

      <Pressable
        onPress={() => router.push('/predictions')}
        style={({ pressed }) => [styles.linkCard, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="time-outline" size={22} color={colors.brand.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyBold">My predictions</Text>
          <Text variant="small" color="muted">See every match you've predicted and the points earned.</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
      </Pressable>

      <NameSection session={session} onUpdated={updateSession} />
      <PasswordSection />

      <View style={styles.signOutWrap}>
        <Button
          label="Sign out"
          variant="secondary"
          onPress={async () => {
            await signOut();
            router.replace('/auth');
          }}
        />
      </View>

      <DeleteAccountSection
        onDeleted={async () => {
          await signOut();
          router.replace('/auth');
        }}
      />
    </Screen>
  );
}

function DeleteAccountSection({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await onDeleted();
    } catch (e) {
      setError((e as Error).message || 'Could not delete account.');
      setBusy(false);
    }
  };

  const onPress = () =>
    confirm(
      'Delete your account?',
      "This permanently removes your profile, predictions, and group memberships. Groups you own will be handed off to the highest-scoring member, or deleted if you're the only one. This can't be undone.",
      'Delete',
      runDelete,
    );

  return (
    <View style={styles.dangerZone}>
      <Text variant="caption" color="muted" style={styles.dangerLabel}>DANGER ZONE</Text>
      <Card style={styles.section}>
        <Text variant="h3">Delete account</Text>
        <Text variant="small" color="muted">
          Erase your profile and everything tied to it. There's no recovery.
        </Text>
        {error ? <Text variant="small" color="danger">{error}</Text> : null}
        <Button label="Delete my account" variant="danger" onPress={onPress} loading={busy} />
      </Card>
    </View>
  );
}

function confirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

function NameSection({
  session,
  onUpdated,
}: {
  session: Session;
  onUpdated: (s: Session) => Promise<void>;
}) {
  const [name, setName] = useState(session.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = name.trim() !== session.name.trim() && name.trim().length > 0;

  const save = async () => {
    if (!dirty) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(name);
      await onUpdated({ ...session, name: updated.name });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.section}>
      <Text variant="h3">Display name</Text>
      <Text variant="small" color="muted">Shown to other group members.</Text>
      <Input value={name} onChangeText={setName} autoCapitalize="words" returnKeyType="done" onSubmitEditing={save} />
      {error ? <Text variant="small" color="danger">{error}</Text> : null}
      {savedFlash ? <Text variant="small" color="success">Saved.</Text> : null}
      <Button label="Save" onPress={save} loading={saving} disabled={!dirty} />
    </Card>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirmPw('');
  };

  const save = async () => {
    setError(null);
    if (!current || !next || !confirmPw) {
      setError('Fill every field.');
      return;
    }
    if (next.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (next !== confirmPw) {
      setError("New passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await updatePassword(current, next);
      reset();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e) {
      setError(humanize(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.section}>
      <Text variant="h3">Change password</Text>
      <Text variant="small" color="muted">Confirm your current password to set a new one.</Text>
      <Input label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
      <Input label="New password" value={next} onChangeText={setNext} secureTextEntry hint="At least 6 characters." />
      <Input label="Confirm new password" value={confirmPw} onChangeText={setConfirmPw} secureTextEntry />
      {error ? <Text variant="small" color="danger">{error}</Text> : null}
      {savedFlash ? <Text variant="small" color="success">Password updated.</Text> : null}
      <Button label="Update password" onPress={save} loading={saving} />
    </Card>
  );
}

function humanize(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Current password is wrong.';
    if (e.status === 400) return e.message;
    return e.message;
  }
  return (e as Error).message;
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.xl },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  section: { gap: spacing.sm, marginBottom: spacing.lg },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surface.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    marginBottom: spacing.lg,
  },
  signOutWrap: { marginTop: spacing.md, marginBottom: spacing.lg },
  dangerZone: { marginTop: spacing.lg, marginBottom: spacing.xl },
  dangerLabel: { marginLeft: spacing.xs, marginBottom: spacing.sm },
});
