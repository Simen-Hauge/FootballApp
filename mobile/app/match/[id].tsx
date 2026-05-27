import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode } from '@/gamemode';
import { matchesApi, type Match } from '@/api/matches';
import { predictionsApi, type Prediction, type FirstGoalScorer, type MatchPredictionEntry } from '@/api/predictions';
import { squadsApi, type Squad, type SquadPlayer } from '@/api/squads';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, radii, spacing } from '@/theme';
import { formatKickoff } from '@/utils/date';

export default function MatchPredictionScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { gamemode } = useGamemode();

  const matchIdNum = parseInt(id ?? '', 10);

  const [match, setMatch] = useState<Match | null>(null);
  const [existing, setExisting] = useState<Prediction | null>(null);
  const [home, setHome] = useState('0');
  const [away, setAway] = useState('0');
  const [scorer, setScorer] = useState<FirstGoalScorer | null>(null);
  const [squads, setSquads] = useState<{ home?: Squad; away?: Squad }>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [matchPredictions, setMatchPredictions] = useState<MatchPredictionEntry[] | null>(null);

  // Load match + existing prediction
  useEffect(() => {
    if (!matchIdNum || !session) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [m, p] = await Promise.all([
          matchesApi.byId(matchIdNum),
          predictionsApi.get(session.email, matchIdNum).catch(() => null),
        ]);
        if (cancelled) return;
        setMatch(m);
        if (p) {
          setExisting(p);
          if (p.score?.home != null) setHome(String(p.score.home));
          if (p.score?.away != null) setAway(String(p.score.away));
          if (p.firstGoalScorer?.playerId && p.firstGoalScorer?.playerName) {
            setScorer({ playerId: p.firstGoalScorer.playerId, playerName: p.firstGoalScorer.playerName });
          }
        }
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
  }, [matchIdNum, session]);

  // Once kickoff has passed, fetch everyone's predictions (reveal mechanic).
  const isLocked = match?.status !== 'not started';
  useEffect(() => {
    if (!match || !isLocked) {
      setMatchPredictions(null);
      return;
    }
    let cancelled = false;
    predictionsApi
      .forMatch(match.matchId)
      .then((data) => {
        if (!cancelled) setMatchPredictions(data);
      })
      .catch(() => {
        if (!cancelled) setMatchPredictions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [match, isLocked]);

  // Poll live score every 60s while the match is in play.
  useEffect(() => {
    if (!match || match.status !== 'ongoing') return;
    const tick = setInterval(async () => {
      try {
        const fresh = await matchesApi.byId(match.matchId);
        setMatch(fresh);
      } catch {
        // Silent; next tick will retry.
      }
    }, 60_000);
    return () => clearInterval(tick);
  }, [match?.matchId, match?.status]);

  // Lazy-load squads only when user opens picker (saves API calls)
  const loadSquads = useCallback(async () => {
    if (!match || (!match.homeTeamId && !match.awayTeamId)) return;
    if (squads.home && squads.away) return;
    try {
      const [homeS, awayS] = await Promise.all([
        match.homeTeamId ? squadsApi.byTeam(match.homeTeamId).catch(() => null) : null,
        match.awayTeamId ? squadsApi.byTeam(match.awayTeamId).catch(() => null) : null,
      ]);
      setSquads({
        home: homeS ?? undefined,
        away: awayS ?? undefined,
      });
    } catch (e) {
      setError(`Couldn't load squads: ${(e as Error).message}`);
    }
  }, [match, squads.home, squads.away]);

  const openPicker = async () => {
    setPickerOpen(true);
    await loadSquads();
  };

  // First-scorer applies to any tournament-style competition where we have squad data.
  // football-data.org returns squads for WC and CL teams; PL teams use the same field
  // but the prediction model here is geared to one-off knockout matches.
  const supportsFirstScorer = !!match && match.competition !== 'PL' && !!match.homeTeamId && !!match.awayTeamId;

  const canSave = !isLocked && /^\d+$/.test(home) && /^\d+$/.test(away);

  const save = async () => {
    if (!canSave || !session || !match) return;
    setSaving(true);
    setError(null);
    try {
      await predictionsApi.save({
        email: session.email,
        matchid: match.matchId,
        score: { home: parseInt(home, 10), away: parseInt(away, 10) },
        // Attribute the prediction to the match's competition, not whichever
        // gamemode the user happens to have selected. This keeps history /
        // leaderboard scoring correct if they're cross-browsing.
        gamemode: String(competitionToGamemode(match.competition)),
        firstGoalScorer: supportsFirstScorer ? scorer : null,
      });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !match) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          {error ? <Text variant="body" color="danger">{error}</Text> : <ActivityIndicator color={colors.brand.primary} />}
        </View>
      </Screen>
    );
  }

  if (pickerOpen) {
    return (
      <FirstScorerPicker
        match={match}
        squads={squads}
        selected={scorer}
        onSelect={(s) => {
          setScorer(s);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="caption" color="brand">{competitionLabel(match.competition)}</Text>
            <Text variant="caption" color="secondary">{formatKickoff(match.kickoffDateTime)}</Text>
          </View>
          <PointsInfoButton scope="match" />
        </View>
      </View>

      <Card style={styles.matchCard}>
        <View style={styles.teamsRow}>
          <TeamColumn name={match.homeTeam} crest={match.homeCrest} />
          {match.status === 'ongoing' || match.status === 'finished' ? (
            <View style={styles.scoreBlock}>
              <Text style={styles.bigScore}>
                {match.score.home ?? 0} – {match.score.away ?? 0}
              </Text>
              <Text variant="caption" color={match.status === 'ongoing' ? 'danger' : 'muted'}>
                {match.status === 'ongoing' ? 'LIVE' : 'FULL TIME'}
              </Text>
            </View>
          ) : (
            <Text variant="h2" color="muted">vs</Text>
          )}
          <TeamColumn name={match.awayTeam} crest={match.awayCrest} />
        </View>
      </Card>

      {!isLocked ? (
        <>
          <Card style={styles.section}>
            <Text variant="h3">Predict the score</Text>
            <View style={styles.scoreInputs}>
              <ScoreStepper label={match.homeTeam} value={home} onChange={setHome} />
              <Text style={styles.scoreDash}>–</Text>
              <ScoreStepper label={match.awayTeam} value={away} onChange={setAway} />
            </View>
          </Card>

          {supportsFirstScorer ? (
            <Card style={styles.section}>
              <Text variant="h3">First goal scorer</Text>
              <Text variant="small" color="muted">Pick the player you think scores first.</Text>
              <Pressable onPress={openPicker} style={({ pressed }) => [styles.scorerSelect, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyBold" color={scorer ? 'primary' : 'muted'}>
                    {scorer ? scorer.playerName : 'Choose a player'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.text.muted} />
              </Pressable>
            </Card>
          ) : null}
        </>
      ) : (
        <Card style={styles.section}>
          <Text variant="h3">Your prediction</Text>
          {existing && existing.score?.home != null && existing.score?.away != null ? (
            <>
              <View style={styles.yourPredScore}>
                <Text style={styles.bigScore}>
                  {existing.score.home} – {existing.score.away}
                </Text>
              </View>
              {existing.firstGoalScorer?.playerName ? (
                <Text variant="small" color="muted" align="center">
                  1st scorer: {existing.firstGoalScorer.playerName}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="body" color="muted">You didn't predict this match.</Text>
          )}
        </Card>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text variant="small" color="danger">{error}</Text>
        </View>
      ) : null}

      {isLocked ? (
        <>
          <Card style={styles.lockedCard}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.text.muted} />
            <Text variant="small" color="muted">
              Predictions are locked — kickoff has passed.
            </Text>
          </Card>

          <Card style={styles.section} padding={0}>
            <View style={styles.predHeader}>
              <Text variant="h3">Everyone's predictions</Text>
              <Text variant="small" color="muted">
                {matchPredictions == null
                  ? 'Loading…'
                  : `${matchPredictions.length} ${matchPredictions.length === 1 ? 'pick' : 'picks'}`}
              </Text>
            </View>
            {matchPredictions == null ? (
              <View style={styles.predLoading}>
                <ActivityIndicator size="small" color={colors.brand.primary} />
              </View>
            ) : matchPredictions.length === 0 ? (
              <View style={styles.predEmpty}>
                <Text variant="small" color="muted">No one predicted this match.</Text>
              </View>
            ) : (
              matchPredictions
                .slice()
                .sort((a, b) => (b.pointsAwarded ?? -1) - (a.pointsAwarded ?? -1))
                .map((p, idx, arr) => {
                  const isYou = session?.id != null && p.playerId != null && String(p.playerId) === String(session.id);
                  return (
                    <View
                      key={p.playerId ?? `${p.name}-${idx}`}
                      style={[
                        styles.predRow,
                        idx === arr.length - 1 && styles.predRowLast,
                        isYou && styles.predRowSelf,
                      ]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="bodyBold">{p.name}{isYou ? ' · YOU' : ''}</Text>
                        {p.firstGoalScorer?.playerName ? (
                          <Text variant="small" color="muted">1st: {p.firstGoalScorer.playerName}</Text>
                        ) : null}
                      </View>
                      <Text variant="bodyBold">{p.score.home ?? '-'}–{p.score.away ?? '-'}</Text>
                      {p.pointsAwarded != null ? (
                        <View style={styles.pointsBadge}>
                          <Text variant="caption" color="inverse" style={{ fontSize: 10 }}>+{p.pointsAwarded}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })
            )}
          </Card>
        </>
      ) : (
        <View style={styles.actions}>
          <Button label={existing ? 'Update prediction' : 'Save prediction'} onPress={save} loading={saving} disabled={!canSave} />
        </View>
      )}
    </Screen>
  );
}

// Football-data.org returns position strings like "Goalkeeper", "Centre-Back",
// "Defensive Midfield", "Centre-Forward". Map them to a coarse rank so the
// first-scorer list reads top-down by role.
const POSITION_ORDER: Array<{ match: RegExp; rank: number }> = [
  { match: /goalkeeper/i, rank: 0 },
  { match: /back|defence|defender/i, rank: 1 },
  { match: /midfield/i, rank: 2 },
  { match: /offence|forward|striker|winger/i, rank: 3 },
];
function positionRank(position: string): number {
  for (const p of POSITION_ORDER) {
    if (p.match.test(position)) return p.rank;
  }
  return 99;
}

const POSITION_GROUP_LABELS: Record<number, string> = {
  0: 'Goalkeeper',
  1: 'Defence',
  2: 'Midfield',
  3: 'Attacker',
};

const COMPETITION_LABELS: Record<string, string> = {
  PL: 'PREMIER LEAGUE',
  WC: 'WORLD CUP',
  CL: 'CHAMPIONS LEAGUE',
};
const COMPETITION_TO_GAMEMODE: Record<string, number> = { PL: 2, WC: 3, CL: 4 };
function competitionLabel(c: string) {
  return COMPETITION_LABELS[c] ?? c.toUpperCase();
}
function competitionToGamemode(c: string) {
  return COMPETITION_TO_GAMEMODE[c] ?? 2;
}

function ScoreStepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const num = parseInt(value, 10) || 0;
  const setNum = (n: number) => onChange(String(Math.max(0, Math.min(20, n))));

  return (
    <View style={styles.stepper}>
      <Text variant="caption" color="muted" numberOfLines={1} style={styles.stepperLabel}>
        {label.toUpperCase()}
      </Text>
      <Pressable
        onPress={() => setNum(num + 1)}
        accessibilityLabel={`Increase ${label} score`}
        hitSlop={6}
        style={({ pressed }) => [styles.stepperBtn, pressed && styles.stepperBtnPressed]}
      >
        <Ionicons name="chevron-up" size={20} color={colors.brand.primary} />
      </Pressable>
      <Text style={styles.stepperNumber}>{num}</Text>
      <Pressable
        onPress={() => setNum(num - 1)}
        accessibilityLabel={`Decrease ${label} score`}
        hitSlop={6}
        disabled={num === 0}
        style={({ pressed }) => [
          styles.stepperBtn,
          num === 0 && styles.stepperBtnDisabled,
          pressed && num > 0 && styles.stepperBtnPressed,
        ]}
      >
        <Ionicons name="chevron-down" size={20} color={num === 0 ? colors.text.muted : colors.brand.primary} />
      </Pressable>
    </View>
  );
}

function TeamColumn({ name, crest }: { name: string; crest?: string | null }) {
  return (
    <View style={styles.teamCol}>
      {crest ? (
        <Image source={{ uri: crest }} style={styles.bigCrest} resizeMode="contain" />
      ) : (
        <View style={[styles.bigCrest, styles.crestFallback]} />
      )}
      <Text variant="bodyBold" align="center" numberOfLines={2}>{name}</Text>
    </View>
  );
}

function FirstScorerPicker({
  match,
  squads,
  selected,
  onSelect,
  onClose,
}: {
  match: Match;
  squads: { home?: Squad; away?: Squad };
  selected: FirstGoalScorer | null;
  onSelect: (s: FirstGoalScorer) => void;
  onClose: () => void;
}) {
  const combined = useMemo(() => {
    type Row = SquadPlayer & { team: string; teamRank: number };
    const homeP: Row[] = (squads.home?.squad ?? []).map((p) => ({ ...p, team: match.homeTeam, teamRank: 0 }));
    const awayP: Row[] = (squads.away?.squad ?? []).map((p) => ({ ...p, team: match.awayTeam, teamRank: 1 }));
    return [...homeP, ...awayP].sort((a, b) => {
      if (a.teamRank !== b.teamRank) return a.teamRank - b.teamRank;
      const pa = positionRank(a.position);
      const pb = positionRank(b.position);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [squads, match]);

  return (
    <Screen>
      <View style={styles.pickerHeader}>
        <Text variant="h2">Pick first scorer</Text>
        <Pressable onPress={onClose} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }}>
          <Ionicons name="close" size={26} color={colors.text.primary} />
        </Pressable>
      </View>
      {combined.length === 0 ? (
        <Card><Text variant="body" color="muted">No squad available yet for these teams.</Text></Card>
      ) : (
        combined.map((p, i) => {
          const isSelected = selected?.playerId === p.id;
          const prev = combined[i - 1];
          const isFirstInTeam = !prev || prev.team !== p.team;
          const rank = positionRank(p.position);
          const isFirstInGroup = isFirstInTeam || positionRank(prev!.position) !== rank;
          return (
            <View key={p.id}>
              {isFirstInTeam ? (
                <Text variant="caption" color="brand" style={styles.teamHeader}>
                  {p.team.toUpperCase()}
                </Text>
              ) : null}
              {isFirstInGroup ? (
                <Text variant="caption" color="muted" style={styles.positionHeader}>
                  {POSITION_GROUP_LABELS[rank] ?? 'Other'}
                </Text>
              ) : null}
              <Card
                padding={'sm'}
                onPress={() => onSelect({ playerId: p.id, playerName: p.name })}
                style={[styles.playerRow, isSelected && styles.playerRowActive]}
              >
                <Text variant="bodyBold" numberOfLines={1} style={styles.playerName}>{p.name}</Text>
                <Text variant="small" color="muted" numberOfLines={1}>{p.position}</Text>
                {isSelected ? <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} /> : null}
              </Card>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginTop: spacing.sm, marginBottom: spacing.md, gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  matchCard: { marginBottom: spacing.lg },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  teamCol: { flex: 1, alignItems: 'center', gap: spacing.sm },
  bigCrest: { width: 60, height: 60 },
  crestFallback: { backgroundColor: colors.surface.cardSubtle, borderRadius: radii.sm },
  section: { gap: spacing.sm, marginBottom: spacing.lg },
  scoreInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  scoreDash: { fontSize: 40, fontWeight: '600', color: colors.text.muted, marginHorizontal: spacing.xs },
  stepper: { flex: 1, alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  stepperLabel: { textAlign: 'center', maxWidth: '100%' },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.surface.cardSubtle,
  },
  stepperBtnPressed: { backgroundColor: colors.brand.primaryLight },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperNumber: {
    fontSize: 56,
    lineHeight: 64,
    fontWeight: '800',
    color: colors.text.primary,
    fontVariant: ['tabular-nums'],
  },
  scorerSelect: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surface.cardSubtle, gap: spacing.md, marginTop: spacing.sm },
  errorBox: { backgroundColor: colors.state.dangerBg, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md },
  lockedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  yourPredScore: { alignItems: 'center', marginVertical: spacing.sm },
  actions: { gap: spacing.sm, marginBottom: spacing.xl },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.lg },
  playerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs, gap: spacing.sm, paddingHorizontal: spacing.md },
  playerRowActive: { borderColor: colors.brand.primary, borderWidth: 2 },
  playerName: { flex: 1 },
  teamHeader: { marginTop: spacing.md, marginBottom: spacing.xs, marginLeft: spacing.xs },
  positionHeader: { marginTop: spacing.sm, marginBottom: spacing.xs, marginLeft: spacing.md },
  scoreBlock: { alignItems: 'center', gap: spacing.xs },
  bigScore: { fontSize: 32, fontWeight: '800', color: colors.text.primary, fontVariant: ['tabular-nums'] },
  predHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  predLoading: { paddingVertical: spacing.xl, alignItems: 'center' },
  predEmpty: { padding: spacing.lg },
  predRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  predRowLast: { borderBottomWidth: 0 },
  predRowSelf: { backgroundColor: colors.brand.primaryLight },
  pointsBadge: { backgroundColor: colors.state.success, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
});
