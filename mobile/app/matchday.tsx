import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card, Screen, Text } from '@/components/ui';
import { MatchCard } from '@/components/MatchCard';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode } from '@/gamemode';
import { matchesApi, type Match } from '@/api/matches';
import { predictionsApi, type Prediction } from '@/api/predictions';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, spacing } from '@/theme';

export default function MatchdayScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { gamemode, meta } = useGamemode();
  const competition = meta.competition;

  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const upcoming = await matchesApi.upcoming(competition, 30);
          if (cancelled) return;
          setMatches(upcoming);

          // Fetch predictions for each match
          const preds = await Promise.all(
            upcoming.map((m) => predictionsApi.get(session.email, m.matchId).catch(() => null)),
          );
          if (cancelled) return;
          const map: Record<number, Prediction | null> = {};
          upcoming.forEach((m, i) => {
            map[m.matchId] = preds[i] ?? null;
          });
          setPredictions(map);
          setError(null);
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [session, competition]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand">{meta.shortLabel} · UPCOMING</Text>
            <Text variant="h1">Matchday</Text>
          </View>
          <PointsInfoButton scope={gamemode === 'world-cup' ? 'wc' : 'match'} />
        </View>
        <Text variant="body" color="secondary" style={styles.sub}>
          Tap any match to predict the score{competition === 'PL' ? '' : ' and first goal scorer'}.
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand.primary} /></View>
      ) : error ? (
        <Card><Text variant="body" color="danger">{error}</Text></Card>
      ) : matches.length === 0 ? (
        <Card>
          <Text variant="body" color="muted">
            No upcoming {meta.label} matches found. Browse the Matches tab to load fixtures.
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {matches.map((m) => (
            <MatchCard
              key={m.matchId}
              match={m}
              prediction={predictions[m.matchId]}
              onPress={() => router.push(`/match/${m.matchId}`)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sub: { marginTop: spacing.xs, lineHeight: 21 },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { gap: spacing.md },
});
