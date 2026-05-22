import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, SERVER_GAMEMODE_ID } from '@/gamemode';
import { groupsApi, type GroupDetail, type GroupSummary } from '@/api/groups';
import { colors, radii, spacing } from '@/theme';

export default function GroupsTab() {
  const { session } = useAuth();
  const { meta, gamemode } = useGamemode();
  const router = useRouter();

  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [details, setDetails] = useState<Record<string, GroupDetail>>({});
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
          setLoading(false);

          const currentModeId = SERVER_GAMEMODE_ID[gamemode];
          const relevant = data.filter((g) => g.gamemode === currentModeId);
          relevant.forEach((g) => {
            groupsApi
              .get(g._id)
              .then((d) => {
                if (cancelled) return;
                setDetails((prev) => ({ ...prev, [g._id]: d }));
              })
              .catch(() => {
                /* per-card error stays silent — card shows "—" instead */
              });
          });
        })
        .catch((e) => {
          if (cancelled) return;
          setError((e as Error).message);
          setGroups([]);
          setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [session, gamemode]),
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
            <GroupCard
              key={g._id}
              group={g}
              detail={details[g._id]}
              meEmail={session?.email}
              onPress={() => router.push(`/group/${g._id}`)}
            />
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

interface GroupCardProps {
  group: GroupSummary;
  detail: GroupDetail | undefined;
  meEmail: string | undefined;
  onPress: () => void;
}

function GroupCard({ group, detail, meEmail, onPress }: GroupCardProps) {
  const sorted = detail
    ? [...detail.members].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    : [];
  const me = meEmail?.toLowerCase();
  const myIndex = me ? sorted.findIndex((m) => m.email.toLowerCase() === me) : -1;
  const top = sorted.slice(0, 3);
  const showMeBelow = myIndex >= 3;
  const totalPlayers = detail?.members.length ?? 0;
  const leaderPoints = sorted[0]?.points ?? 0;

  return (
    <Card onPress={onPress} padding={0} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderText}>
          <Text variant="bodyBold" numberOfLines={1}>{group.groupName}</Text>
          <Text variant="small" color="muted" numberOfLines={1}>
            {group.tournament} · code {group.joinCode}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
      </View>

      <View style={styles.divider} />

      {!detail ? (
        <View style={styles.standingsLoading}>
          <ActivityIndicator size="small" color={colors.brand.primary} />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.standingsEmpty}>
          <Text variant="small" color="muted">No players yet — share the code to get started.</Text>
        </View>
      ) : (
        <View style={styles.standings}>
          {top.map((m, idx) => (
            <StandingRow
              key={m._id}
              rank={idx + 1}
              name={m.name}
              points={m.points ?? 0}
              isYou={!!me && m.email.toLowerCase() === me}
              isLeader={idx === 0}
              leaderPoints={leaderPoints}
            />
          ))}
          {showMeBelow && sorted[myIndex] ? (
            <>
              <View style={styles.ellipsisRow}>
                <Text variant="caption" color="muted">⋯</Text>
              </View>
              <StandingRow
                rank={myIndex + 1}
                name={sorted[myIndex].name}
                points={sorted[myIndex].points ?? 0}
                isYou
                isLeader={false}
                leaderPoints={leaderPoints}
              />
            </>
          ) : null}
        </View>
      )}

      <View style={styles.cardFooter}>
        <Text variant="caption" color="muted">
          {totalPlayers} {totalPlayers === 1 ? 'player' : 'players'}
        </Text>
        <Text variant="caption" color="brand">View standings →</Text>
      </View>
    </Card>
  );
}

interface StandingRowProps {
  rank: number;
  name: string;
  points: number;
  isYou: boolean;
  isLeader: boolean;
  leaderPoints: number;
}

function StandingRow({ rank, name, points, isYou, isLeader, leaderPoints }: StandingRowProps) {
  const gap = leaderPoints - points;
  return (
    <View style={[styles.row, isYou && styles.rowMe]}>
      <View
        style={[
          styles.rankBadge,
          isLeader && styles.rankBadgeLeader,
          isYou && !isLeader && styles.rankBadgeMe,
        ]}
      >
        {isLeader ? (
          <Ionicons name="trophy" size={12} color={colors.text.onAccent} />
        ) : (
          <Text variant="caption" color={isYou ? 'inverse' : 'primary'} style={styles.rankText}>
            {rank}
          </Text>
        )}
      </View>
      <View style={styles.nameWrap}>
        <Text variant="bodyBold" numberOfLines={1}>{name}</Text>
        {isYou ? <Text variant="caption" color="brand">YOU</Text> : null}
      </View>
      <View style={styles.pointsWrap}>
        <Text variant="bodyBold">{points}</Text>
        {!isLeader && gap > 0 ? (
          <Text variant="caption" color="muted">-{gap}</Text>
        ) : (
          <Text variant="caption" color="muted">pts</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  actions: { gap: spacing.sm, marginBottom: spacing.lg },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  list: { gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },

  card: { borderRadius: radii.lg, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  cardHeaderText: { flex: 1, gap: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border.subtle },

  standings: { paddingVertical: spacing.xs },
  standingsLoading: { paddingVertical: spacing.lg, alignItems: 'center' },
  standingsEmpty: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowMe: { backgroundColor: colors.brand.primaryLight },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeLeader: { backgroundColor: colors.brand.accent },
  rankBadgeMe: { backgroundColor: colors.brand.primary },
  rankText: { fontWeight: '700' },
  nameWrap: { flex: 1, gap: 2 },
  pointsWrap: { alignItems: 'flex-end', minWidth: 44 },

  ellipsisRow: {
    alignItems: 'center',
    paddingVertical: 2,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.cardSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
  },
});
