import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, Text } from '@/components/ui';
import { GamemodeToggle } from '@/components/GamemodeToggle';
import { useAuth } from '@/auth/AuthContext';
import { colors, radii, spacing } from '@/theme';

export default function AccountTab() {
  const { session } = useAuth();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="brand">YOU</Text>
        <Text variant="h1">Account</Text>
      </View>

      <Card style={styles.identityCard} onPress={() => router.push('/profile')}>
        <View style={styles.avatar}>
          <Text variant="h2" color="inverse">
            {(session?.name ?? '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.identityText}>
          <Text variant="bodyBold">{session?.name ?? '—'}</Text>
          <Text variant="small" color="muted">{session?.email ?? ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
      </Card>

      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>Active gamemode</Text>
        <GamemodeToggle />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 2 },
  section: { marginTop: spacing.xl, gap: spacing.md },
  sectionTitle: { marginLeft: spacing.xs },
});
