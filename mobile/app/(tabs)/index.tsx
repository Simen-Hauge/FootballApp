import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card, Screen, Text } from '@/components/ui';
import { MatchCard } from '@/components/MatchCard';
import { GamemodeToggle } from '@/components/GamemodeToggle';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, SERVER_GAMEMODE_ID } from '@/gamemode';
import { matchesApi, type Match } from '@/api/matches';
import { predictionsApi, type Prediction } from '@/api/predictions';
import { groupsApi } from '@/api/groups';
import { leaderboardApi } from '@/api/leaderboard';
import { colors, radii, spacing } from '@/theme';

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
        <Text variant="caption" color="brand">DASHBOARD</Text>
        <Text variant="h1">Hey, {session?.name?.split(' ')[0] ?? 'predictor'}.</Text>
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
          <Card style={styles.fullCard} onPress={() => router.push('/wc/group-stage')}>
            <Text variant="caption" color="secondary">WORLD CUP · GROUP STAGE</Text>
            <Text variant="h3" style={styles.shortcutLabel}>Predict the 12 groups</Text>
            <Text variant="small" color="muted">Rank the 4 teams in each group from 1st to 4th.</Text>
          </Card>
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

const styles = StyleSheet.create({
  toggleWrapper: { marginTop: spacing.xs, marginBottom: spacing.lg },
  header: { marginBottom: spacing.lg, gap: spacing.xs },
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
});
