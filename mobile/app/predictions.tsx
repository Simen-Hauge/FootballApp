import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, SERVER_GAMEMODE_ID, type Gamemode } from '@/gamemode';
import { predictionsApi, type HistoryEntry } from '@/api/predictions';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, radii, spacing } from '@/theme';
import { formatKickoff } from '@/utils/date';

type Filter = 'current' | 'all';

export default function PredictionsHistoryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { gamemode } = useGamemode();

  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('current');

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      setLoading(true);
      predictionsApi
        .history(session.email, undefined, 200) // load all, filter client-side
        .then((data) => {
          if (!cancelled) {
            setEntries(data);
            setError(null);
          }
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
    }, [session]),
  );

  const filtered = useMemo(() => {
    if (!entries) return [];
    if (filter === 'all') return entries;
    return entries.filter((e) => e.gamemode === String(SERVER_GAMEMODE_ID[gamemode as Gamemode]));
  }, [entries, filter, gamemode]);

  const totalPoints = filtered.reduce((sum, e) => sum + (e.pointsAwarded ?? 0), 0);
  const scored = filtered.filter((e) => e.pointsAwarded != null);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand">YOU · HISTORY</Text>
            <Text variant="h1">My predictions</Text>
          </View>
          <PointsInfoButton scope={gamemode === 'world-cup' ? 'wc' : 'match'} />
        </View>
      </View>

      <Card style={styles.statCard}>
        <View style={styles.statRow}>
          <Stat label="Predictions" value={String(filtered.length)} />
          <Divider />
          <Stat label="Scored" value={String(scored.length)} />
          <Divider />
          <Stat label="Total pts" value={String(totalPoints)} />
        </View>
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <FilterPill label="Current mode" active={filter === 'current'} onPress={() => setFilter('current')} />
        <FilterPill label="All gamemodes" active={filter === 'all'} onPress={() => setFilter('all')} />
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand.primary} /></View>
      ) : error ? (
        <Card><Text variant="body" color="danger">{error}</Text></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <Text variant="body" color="muted">No predictions yet. Head to Matchday and pick a score.</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {filtered.map((e) => (
            <PredictionRow key={e.id} entry={e} onPress={e.match ? () => router.push(`/match/${e.match!.matchId}`) : undefined} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function PredictionRow({ entry, onPress }: { entry: HistoryEntry; onPress?: () => void }) {
  const m = entry.match;
  const isFinished = m?.status === 'finished';
  const correct = isFinished && m && m.score.home === entry.score.home && m.score.away === entry.score.away;

  return (
    <Card onPress={onPress} style={styles.row}>
      {m ? (
        <View style={styles.metaRow}>
          <Text variant="caption" color="secondary">{formatKickoff(m.kickoffDateTime)}</Text>
          {entry.pointsAwarded != null ? (
            <View style={[styles.pointsBadge, entry.pointsAwarded > 0 ? styles.pointsBadgeWin : styles.pointsBadgeZero]}>
              <Text variant="caption" color="inverse" style={{ fontSize: 10 }}>+{entry.pointsAwarded}</Text>
            </View>
          ) : (
            <Text variant="caption" color="muted">PENDING</Text>
          )}
        </View>
      ) : null}

      <View style={styles.teamsRow}>
        <TeamMini name={m?.homeTeam ?? '?'} crest={m?.homeCrest} />
        <View style={styles.scoreBlock}>
          <Text variant="bodyBold" style={styles.scoreYou}>
            {entry.score.home ?? '-'}–{entry.score.away ?? '-'}
          </Text>
          {isFinished && m ? (
            <Text variant="caption" color={correct ? 'success' : 'muted'}>
              {correct ? 'EXACT' : `FINAL ${m.score.home}–${m.score.away}`}
            </Text>
          ) : null}
        </View>
        <TeamMini name={m?.awayTeam ?? '?'} crest={m?.awayCrest} mirror />
      </View>

      {entry.firstGoalScorer?.playerName ? (
        <Text variant="small" color="muted" align="center">
          1st: {entry.firstGoalScorer.playerName}
        </Text>
      ) : null}
    </Card>
  );
}

function TeamMini({ name, crest, mirror }: { name: string; crest?: string | null; mirror?: boolean }) {
  return (
    <View style={[styles.team, mirror && styles.teamMirrored]}>
      {crest ? (
        <Image source={{ uri: crest }} style={styles.crest} resizeMode="contain" />
      ) : (
        <View style={[styles.crest, styles.crestFallback]} />
      )}
      <Text variant="bodyBold" numberOfLines={1} style={styles.teamName}>{name}</Text>
    </View>
  );
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.filterPill, active && styles.filterPillActive]}>
      <Text variant="bodyBold" color={active ? 'inverse' : 'secondary'}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h2">{value}</Text>
      <Text variant="caption" color="secondary">{label}</Text>
    </View>
  );
}

function Divider() { return <View style={styles.divider} />; }

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  statCard: { paddingVertical: spacing.lg, marginBottom: spacing.lg },
  statRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  divider: { width: 1, height: 32, backgroundColor: colors.border.subtle },
  filterRow: { gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: 2 },
  filterPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surface.cardSubtle },
  filterPillActive: { backgroundColor: colors.brand.primary },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { gap: spacing.md },
  row: { gap: spacing.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  team: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minWidth: 0 },
  teamMirrored: { flexDirection: 'row-reverse' },
  teamName: { flexShrink: 1 },
  crest: { width: 22, height: 22 },
  crestFallback: { backgroundColor: colors.surface.cardSubtle, borderRadius: radii.sm },
  scoreBlock: { alignItems: 'center', gap: 2, minWidth: 56 },
  scoreYou: { fontSize: 20, fontVariant: ['tabular-nums'] },
  pointsBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  pointsBadgeWin: { backgroundColor: colors.state.success },
  pointsBadgeZero: { backgroundColor: colors.text.muted },
});
