import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Screen, Text } from '@/components/ui';
import { MatchCard } from '@/components/MatchCard';
import { GamemodeToggle } from '@/components/GamemodeToggle';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode } from '@/gamemode';
import { matchesApi, type Match } from '@/api/matches';
import { predictionsApi, type Prediction } from '@/api/predictions';
import { colors, radii, spacing } from '@/theme';

const PL_MATCHWEEKS = Array.from({ length: 38 }, (_, i) => i + 1);

const WC_STAGES: Array<{ value: string; label: string }> = [
  { value: 'GROUP_STAGE', label: 'Group stage' },
  { value: 'LAST_16', label: 'Round of 16' },
  { value: 'QUARTER_FINALS', label: 'Quarter-finals' },
  { value: 'SEMI_FINALS', label: 'Semi-finals' },
  { value: 'THIRD_PLACE', label: '3rd place' },
  { value: 'FINAL', label: 'Final' },
];

const CL_STAGES: Array<{ value: string; label: string }> = [
  { value: 'LAST_16', label: 'Round of 16' },
  { value: 'QUARTER_FINALS', label: 'Quarter-finals' },
  { value: 'SEMI_FINALS', label: 'Semi-finals' },
  { value: 'FINAL', label: 'Final' },
];

export default function MatchesTab() {
  const router = useRouter();
  const { session } = useAuth();
  const { meta } = useGamemode();
  const competition = meta.competition;
  const usesStages = competition !== 'PL';
  const stages = competition === 'WC' ? WC_STAGES : CL_STAGES;

  const [plMW, setPlMW] = useState<number>(1);
  const [stage, setStage] = useState<string>(stages[0].value);
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<number, Prediction | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const days = useMemo(() => {
    const set = new Set<string>();
    for (const m of matches) set.add(localDayKey(m.kickoffDateTime));
    return Array.from(set);
  }, [matches]);

  useEffect(() => {
    if (days.length === 0) {
      setSelectedDay(null);
      return;
    }
    const today = localDayKey(new Date());
    setSelectedDay(days.includes(today) ? today : days[0]);
  }, [days]);

  const visibleMatches = useMemo(
    () => (selectedDay ? matches.filter((m) => localDayKey(m.kickoffDateTime) === selectedDay) : matches),
    [matches, selectedDay],
  );

  // Reset the selected stage when switching tournament-style competitions.
  useEffect(() => {
    if (usesStages) setStage(stages[0].value);
  }, [usesStages, stages]);

  // Default to current matchweek for PL on first load
  useEffect(() => {
    if (competition !== 'PL') return;
    matchesApi.currentMatchweek('PL').then(({ matchweek }) => setPlMW(matchweek)).catch(() => {});
  }, [competition]);

  const fetcher = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      const data = usesStages
        ? await matchesApi.byStage(stage, competition)
        : await matchesApi.byMatchweek(plMW, competition);
      const sorted = [...data].sort(
        (a, b) => new Date(a.kickoffDateTime).getTime() - new Date(b.kickoffDateTime).getTime(),
      );
      setMatches(sorted);

      const preds = await Promise.all(
        sorted.map((m) => predictionsApi.get(session.email, m.matchId).catch(() => null)),
      );
      const map: Record<number, Prediction | null> = {};
      sorted.forEach((m, i) => {
        map[m.matchId] = preds[i] ?? null;
      });
      setPredictions(map);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session, usesStages, stage, plMW, competition]);

  useEffect(() => {
    fetcher();
  }, [fetcher]);

  return (
    <Screen>
      <View style={styles.toggleWrapper}>
        <GamemodeToggle />
      </View>

      <View style={styles.header}>
        <Text variant="caption" color="brand">{meta.shortLabel} · FIXTURES</Text>
        <Text variant="h1">Matches</Text>
      </View>

      {usesStages ? (
        <StageSelector value={stage} onChange={setStage} options={stages} />
      ) : (
        <MatchweekSelector value={plMW} onChange={setPlMW} />
      )}

      {!loading && days.length > 1 ? (
        <DaySelector value={selectedDay} onChange={setSelectedDay} days={days} />
      ) : null}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brand.primary} /></View>
      ) : error ? (
        <Card><Text variant="body" color="danger">{error}</Text></Card>
      ) : visibleMatches.length === 0 ? (
        <Card>
          <Text variant="body" color="muted">No matches yet for this selection.</Text>
        </Card>
      ) : (
        <View style={styles.list}>
          {visibleMatches.map((m) => (
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

function MatchweekSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll} contentContainerStyle={styles.selector}>
      {PL_MATCHWEEKS.map((mw) => {
        const active = mw === value;
        return (
          <Pressable key={mw} onPress={() => onChange(mw)} style={[styles.pill, active && styles.pillActive]}>
            <Text variant="bodyBold" color={active ? 'inverse' : 'secondary'}>MW {mw}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function DaySelector({ value, onChange, days }: { value: string | null; onChange: (v: string) => void; days: string[] }) {
  const todayKey = localDayKey(new Date());
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll} contentContainerStyle={styles.selector}>
      {days.map((d) => {
        const active = d === value;
        const { weekday, dayMonth } = formatDayLabel(d, todayKey);
        return (
          <Pressable key={d} onPress={() => onChange(d)} style={[styles.dayPill, active && styles.pillActive]}>
            <Text variant="caption" color={active ? 'inverse' : 'muted'}>{weekday}</Text>
            <Text variant="bodyBold" color={active ? 'inverse' : 'secondary'}>{dayMonth}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function StageSelector({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectorScroll} contentContainerStyle={styles.selector}>
      {options.map((s) => {
        const active = s.value === value;
        return (
          <Pressable key={s.value} onPress={() => onChange(s.value)} style={[styles.pill, active && styles.pillActive]}>
            <Text variant="bodyBold" color={active ? 'inverse' : 'secondary'}>{s.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function localDayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayLabel(key: string, todayKey: string): { weekday: string; dayMonth: string } {
  if (key === todayKey) return { weekday: 'Today', dayMonth: '' };
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString([], { weekday: 'short' });
  const dayMonth = date.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return { weekday, dayMonth };
}

const styles = StyleSheet.create({
  toggleWrapper: { marginTop: spacing.xs, marginBottom: spacing.lg },
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  selectorScroll: { flexGrow: 0 },
  selector: { gap: spacing.sm, paddingBottom: spacing.lg, paddingHorizontal: 2, alignItems: 'center' },
  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surface.cardSubtle },
  dayPill: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface.cardSubtle, alignItems: 'center', minWidth: 64 },
  pillActive: { backgroundColor: colors.brand.primary },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  list: { gap: spacing.md },
});
