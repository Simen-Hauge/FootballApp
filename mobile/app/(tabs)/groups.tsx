import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, SERVER_GAMEMODE_ID } from '@/gamemode';
import { groupsApi, type GroupSummary } from '@/api/groups';
import { colors, radii, spacing } from '@/theme';

export default function GroupsTab() {
  const { session } = useAuth();
  const { meta, gamemode } = useGamemode();
  const router = useRouter();

  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (!session) return;
      setLoading(true);
      groupsApi
        .listMine(session.email)
        .then((data) => {
          if (cancelled) return;
          setGroups(data);
          setError(null);
        })
        .catch((e) => {
          if (cancelled) return;
          setError((e as Error).message);
          setGroups([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [session]),
  );

  const currentModeId = SERVER_GAMEMODE_ID[gamemode];
  const filtered = (groups ?? []).filter((g) => g.gamemode === currentModeId);

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="brand">{meta.shortLabel} · COMPETE</Text>
        <Text variant="h1">Groups</Text>
      </View>

      <View style={styles.actions}>
        <Button label="Create group" onPress={() => router.push('/group/create')} />
        <Button label="Join with code" variant="secondary" onPress={() => router.push('/group/join')} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      ) : error ? (
        <Card><Text variant="body" color="danger">{error}</Text></Card>
      ) : filtered.length === 0 ? (
        <EmptyState gamemodeLabel={meta.label} />
      ) : (
        <View style={styles.list}>
          {filtered.map((g) => (
            <GroupRow key={g._id} group={g} onPress={() => router.push(`/group/${g._id}`)} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function EmptyState({ gamemodeLabel }: { gamemodeLabel: string }) {
  return (
    <Card style={styles.empty}>
      <Ionicons name="people-outline" size={32} color={colors.text.muted} />
      <Text variant="h3" align="center">No {gamemodeLabel} groups yet</Text>
      <Text variant="small" color="muted" align="center">
        Create one to play with friends, or paste a join code if someone invited you.
      </Text>
    </Card>
  );
}

function GroupRow({ group, onPress }: { group: GroupSummary; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.row} padding={'lg'}>
      <View style={styles.rowContent}>
        <View style={styles.rowText}>
          <Text variant="bodyBold">{group.groupName}</Text>
          <Text variant="small" color="muted">{group.tournament} · code {group.joinCode}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  actions: { gap: spacing.sm, marginBottom: spacing.lg },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  list: { gap: spacing.sm },
  row: { borderRadius: radii.lg },
  rowContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowText: { gap: 2, flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
