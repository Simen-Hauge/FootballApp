import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, SERVER_GAMEMODE_ID } from '@/gamemode';
import { leaderboardApi, type LeaderboardEntry } from '@/api/leaderboard';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, radii, spacing } from '@/theme';

export default function Scoreboard() {
  const { session } = useAuth();
  const { meta, gamemode } = useGamemode();
  const serverGamemode = SERVER_GAMEMODE_ID[gamemode];

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      leaderboardApi
        .top(50, serverGamemode)
        .then((data) => {
          if (!cancelled) setEntries(data);
        })
        .catch((e) => {
          if (!cancelled) setError((e as Error).message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [serverGamemode]),
  );

  const youIndex = entries.findIndex(
    (e) => session?.id && String(e.id) === String(session.id),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand">{meta.shortLabel} · GLOBAL</Text>
            <Text variant="h1">Scoreboard</Text>
          </View>
          <PointsInfoButton scope={gamemode === 'world-cup' ? 'wc' : 'match'} />
        </View>
        <Text variant="body" color="secondary" style={styles.sub}>
          Top {meta.label} predictors. Points are awarded after each match settles.
        </Text>
        {youIndex >= 0 ? (
          <Text variant="caption" color="muted">YOU ARE RANK {entries[youIndex].rank} · {entries[youIndex].points} POINTS</Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand.primary} /></View>
      ) : error ? (
        <Card><Text variant="body" color="danger">{error}</Text></Card>
      ) : entries.length === 0 ? (
        <Card><Text variant="body" color="muted">No scores yet.</Text></Card>
      ) : (
        <Card padding={0}>
          {entries.map((e, idx) => {
            const isYou = session?.id != null && String(e.id) === String(session.id);
            return (
              <View
                key={e.id}
                style={[
                  styles.row,
                  idx === entries.length - 1 && styles.rowLast,
                  isYou && styles.rowSelf,
                ]}
              >
                <View style={[styles.rank, e.rank === 1 && styles.rankFirst, e.rank === 2 && styles.rankSecond, e.rank === 3 && styles.rankThird]}>
                  <Text variant="bodyBold" color={e.rank <= 3 ? 'inverse' : 'primary'}>{e.rank}</Text>
                </View>
                <View style={styles.nameWrap}>
                  <Text variant="bodyBold">{e.name}</Text>
                  {isYou ? <Text variant="caption" color="brand">YOU</Text> : null}
                </View>
                <Text variant="bodyBold">{e.points}</Text>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sub: { marginTop: spacing.xs, lineHeight: 21 },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  rowLast: { borderBottomWidth: 0 },
  rowSelf: { backgroundColor: colors.brand.primaryLight },
  rank: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankFirst: { backgroundColor: colors.brand.accent },
  rankSecond: { backgroundColor: colors.brand.secondary },
  rankThird: { backgroundColor: colors.brand.primary },
  nameWrap: { flex: 1, gap: 2 },
});
