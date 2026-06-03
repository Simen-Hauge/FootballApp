import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text } from '@/components/ui';
import { MatchCard } from '@/components/MatchCard';
import { GamemodeToggle } from '@/components/GamemodeToggle';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, SERVER_GAMEMODE_ID } from '@/gamemode';
import { matchesApi, type Match } from '@/api/matches';
import { predictionsApi, type Prediction } from '@/api/predictions';
import { groupsApi } from '@/api/groups';
import { leaderboardApi } from '@/api/leaderboard';
import { tournamentPredictionsApi } from '@/api/tournamentPredictions';
import { getWorldCupGroupStandings, wcGroupPredictionsApi } from '@/api/wc';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, radii, spacing } from '@/theme';

type WcChecklist = { goldenBoot: boolean; topThree: boolean; groups: boolean; locked: boolean };

export default function Dashboard() {
  const router = useRouter();
  const { session } = useAuth();
  const { meta, gamemode } = useGamemode();
  const competition = meta.competition;

  const [nextMatch, setNextMatch] = useState<Match | null>(null);
  const [nextPrediction, setNextPrediction] = useState<Prediction | null>(null);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [wcChecklist, setWcChecklist] = useState<WcChecklist | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          // Next upcoming match for this competition (single server query).
          const foundMatch = await matchesApi.next(competition).catch(() => null);
          if (cancelled) return;
          setNextMatch(foundMatch);

          // Prediction for that match
          if (foundMatch) {
            const p = await predictionsApi.get(session.email, foundMatch.matchId).catch(() => null);
            if (!cancelled) setNextPrediction(p ?? null);
          } else {
            setNextPrediction(null);
          }

          // Group count for current gamemode
          const groups = await groupsApi.listMine(session.email).catch(() => []);
          const currentModeId = SERVER_GAMEMODE_ID[gamemode];
          if (!cancelled) setGroupCount(groups.filter((g) => g.gamemode === currentModeId).length);

          // Rank & points from the leaderboard for the active gamemode
          const lb = await leaderboardApi.top(200, SERVER_GAMEMODE_ID[gamemode]).catch(() => []);
          const me = lb.find((e) => String(e.id) === String(session.id));
          if (!cancelled) {
            setRank(me?.rank ?? null);
            setPoints(me?.points ?? 0);
          }

          // Pre-tournament checklist (World Cup only): golden boot, top 3, group placements.
          if (gamemode === 'world-cup') {
            const [predRes, standings, serverGroups] = await Promise.all([
              tournamentPredictionsApi.get(competition).catch(() => null),
              getWorldCupGroupStandings().catch(() => []),
              wcGroupPredictionsApi.list(session.email).catch(() => []),
            ]);
            if (!cancelled) {
              const pred = predRes?.prediction;
              const totalGroups = standings.length;
              const doneGroups = serverGroups.filter((g) => g.rankedTeamIds.length >= 4).length;
              setWcChecklist({
                goldenBoot: pred?.goldenBoot?.playerId != null,
                topThree: !!pred?.topThree?.length && pred.topThree.every((p) => p.teamId != null),
                groups: totalGroups > 0 && doneGroups >= totalGroups,
                locked: predRes?.locked ?? false,
              });
            }
          } else if (!cancelled) {
            setWcChecklist(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [session, gamemode, competition]),
  );

  return (
    <Screen>
      <View style={styles.toggleWrapper}>
        <GamemodeToggle />
      </View>

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand">DASHBOARD</Text>
            <Text variant="h1">Hey, {session?.name?.split(' ')[0] ?? 'predictor'}.</Text>
          </View>
          <PointsInfoButton scope={gamemode === 'world-cup' ? 'wc' : 'match'} />
        </View>
        <Text variant="body" color="secondary" style={styles.tagline}>{meta.tagline}</Text>
      </View>

      <Card style={styles.statCard}>
        <View style={styles.statRow}>
          <Stat label="Points" value={loading ? '…' : String(points ?? 0)} />
          <Divider />
          <Stat label="Rank" value={loading ? '…' : rank ? `#${rank}` : '—'} />
          <Divider />
          <Stat label="Groups" value={loading ? '…' : String(groupCount ?? 0)} />
        </View>
      </Card>

      {!loading && groupCount === 0 ? (
        <Card style={styles.welcomeCard}>
          <Text variant="caption" color="brand">WELCOME TO FOOTYGURU</Text>
          <Text variant="h3">Join a group to start playing</Text>
          <Text variant="small" color="muted">
            Compete with friends — create a group and share the code, or join one you've been invited to.
          </Text>
          <View style={styles.welcomeActions}>
            <Button label="Create group" onPress={() => router.push('/group/create')} fullWidth={false} />
            <Button label="Join with code" variant="secondary" onPress={() => router.push('/group/join')} fullWidth={false} />
          </View>
        </Card>
      ) : null}

      {!loading && gamemode === 'world-cup' && wcChecklist ? (
        <WcPicksBanner checklist={wcChecklist} onNavigate={(route) => router.push(route)} />
      ) : null}

      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>Up next</Text>
        {loading ? (
          <Card><ActivityIndicator color={colors.brand.primary} /></Card>
        ) : nextMatch ? (
          <MatchCard
            match={nextMatch}
            prediction={nextPrediction}
            onPress={() => router.push(`/match/${nextMatch.matchId}`)}
          />
        ) : (
          <Card>
            <Text variant="body" color="muted">
              No upcoming {meta.label} matches in the next week.
            </Text>
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>Shortcuts</Text>
        <View style={styles.shortcutGrid}>
          <Card style={styles.shortcut} onPress={() => router.push('/matchday')}>
            <Text variant="caption" color="secondary">PREDICT</Text>
            <Text variant="h3" style={styles.shortcutLabel}>Matchday</Text>
          </Card>
          <Card style={styles.shortcut} onPress={() => router.push('/scoreboard')}>
            <Text variant="caption" color="secondary">LEADERBOARD</Text>
            <Text variant="h3" style={styles.shortcutLabel}>Scoreboard</Text>
          </Card>
        </View>
        {gamemode === 'world-cup' ? (
          <>
            <Card style={styles.fullCard} onPress={() => router.push('/wc/group-stage')}>
              <Text variant="caption" color="secondary">WORLD CUP · GROUP STAGE</Text>
              <Text variant="h3" style={styles.shortcutLabel}>Predict the 12 groups</Text>
              <Text variant="small" color="muted">Rank the 4 teams in each group from 1st to 4th.</Text>
            </Card>
            <Card style={styles.fullCard} onPress={() => router.push('/wc/tournament-picks')}>
              <Text variant="caption" color="secondary">WORLD CUP · TOURNAMENT</Text>
              <Text variant="h3" style={styles.shortcutLabel}>Golden Boot &amp; Top 3</Text>
              <Text variant="small" color="muted">Pick the top scorer and the 3 teams on the podium.</Text>
            </Card>
          </>
        ) : null}
      </View>
    </Screen>
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

function Divider() {
  return <View style={styles.divider} />;
}

function WcPicksBanner({
  checklist,
  onNavigate,
}: {
  checklist: WcChecklist;
  onNavigate: (route: string) => void;
}) {
  // Don't nag once predictions are locked (tournament has kicked off) — nothing left to change.
  if (checklist.locked) return null;

  const items = [
    { key: 'groups', done: checklist.groups, label: 'Group placements', hint: 'Rank all 12 groups', route: '/wc/group-stage' },
    { key: 'topThree', done: checklist.topThree, label: 'Top 3 teams', hint: 'Pick the podium', route: '/wc/tournament-picks' },
    { key: 'goldenBoot', done: checklist.goldenBoot, label: 'Golden Boot', hint: 'Pick the top scorer', route: '/wc/tournament-picks' },
  ] as const;

  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null;

  return (
    <Card style={styles.alertCard}>
      <View style={styles.alertHeader}>
        <Ionicons name="alert-circle" size={20} color={colors.state.warning} />
        <Text variant="bodyBold" style={{ flex: 1 }}>Finish your pre-tournament picks</Text>
      </View>
      <Text variant="small" color="muted">
        {remaining} of {items.length} selections still need a pick before the tournament starts.
      </Text>
      <View style={styles.alertList}>
        {items.map((item) => (
          <Pressable
            key={item.key}
            onPress={() => onNavigate(item.route)}
            disabled={item.done}
            style={({ pressed }) => [styles.alertRow, pressed && !item.done && styles.alertRowPressed]}
          >
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={item.done ? colors.state.success : colors.state.warning}
            />
            <View style={{ flex: 1 }}>
              <Text variant="body" color={item.done ? 'muted' : 'primary'}>{item.label}</Text>
              {!item.done ? <Text variant="small" color="muted">{item.hint}</Text> : null}
            </View>
            {!item.done ? <Ionicons name="chevron-forward" size={16} color={colors.text.muted} /> : null}
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  toggleWrapper: { marginTop: spacing.xs, marginBottom: spacing.lg },
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  headerTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tagline: { marginTop: spacing.xs, lineHeight: 21 },
  statCard: { paddingVertical: spacing.lg },
  statRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  stat: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  divider: { width: 1, height: 32, backgroundColor: colors.border.subtle },
  section: { marginTop: spacing.xl, gap: spacing.md },
  sectionTitle: { marginLeft: spacing.xs },
  shortcutGrid: { flexDirection: 'row', gap: spacing.md },
  shortcut: { flex: 1, borderRadius: radii.lg, gap: spacing.xs },
  shortcutLabel: { marginTop: 2 },
  fullCard: { gap: spacing.xs },
  welcomeCard: { marginTop: spacing.lg, gap: spacing.sm },
  welcomeActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  alertCard: {
    marginTop: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.state.dangerBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brand.primaryLight,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  alertList: { marginTop: spacing.xs, gap: spacing.xs },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surface.card,
  },
  alertRowPressed: { backgroundColor: colors.surface.cardSubtle },
});
