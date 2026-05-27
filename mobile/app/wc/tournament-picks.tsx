import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import {
  tournamentPredictionsApi,
  type GoldenBootPick,
  type TopThreePick,
} from '@/api/tournamentPredictions';
import { getCompetitionTeams, type CompetitionTeam } from '@/api/wc';
import { squadsApi, type Squad, type SquadPlayer } from '@/api/squads';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, radii, shadows, spacing } from '@/theme';

const COMPETITION = 'WC';

export default function TournamentPicksScreen() {
  const { session } = useAuth();
  const [teams, setTeams] = useState<CompetitionTeam[] | null>(null);
  const [goldenBoot, setGoldenBoot] = useState<GoldenBootPick>({ playerId: null, playerName: null, teamId: null });
  const [topThree, setTopThree] = useState<TopThreePick[]>([
    { rank: 1, teamId: null, teamName: null },
    { rank: 2, teamId: null, teamName: null },
    { rank: 3, teamId: null, teamName: null },
  ]);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bootPickerOpen, setBootPickerOpen] = useState(false);
  const [teamPickerOpenForRank, setTeamPickerOpenForRank] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [teamsRes, predRes] = await Promise.all([
          getCompetitionTeams(COMPETITION),
          tournamentPredictionsApi.get(COMPETITION),
        ]);
        if (cancelled) return;
        setTeams(teamsRes);
        setLocked(predRes.locked);
        if (predRes.prediction) {
          if (predRes.prediction.goldenBoot) setGoldenBoot(predRes.prediction.goldenBoot);
          if (predRes.prediction.topThree?.length) {
            // Backfill missing ranks so we always render three rows.
            const next = [1, 2, 3].map((rank) => {
              const slot = predRes.prediction!.topThree.find((p) => p.rank === rank);
              return slot ?? { rank: rank as 1 | 2 | 3, teamId: null, teamName: null };
            });
            setTopThree(next as TopThreePick[]);
          }
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const teamsById = useMemo(() => {
    const map = new Map<number, CompetitionTeam>();
    for (const t of teams ?? []) map.set(t.teamId, t);
    return map;
  }, [teams]);

  const handlePickPlayer = useCallback((team: CompetitionTeam, player: SquadPlayer) => {
    setGoldenBoot({ playerId: player.id, playerName: player.name, teamId: team.teamId });
    setDirty(true);
    setBootPickerOpen(false);
  }, []);

  const handlePickTeamForRank = useCallback((rank: 1 | 2 | 3, team: CompetitionTeam) => {
    setTopThree((prev) => {
      // Prevent picking the same team twice across top-3.
      const cleaned = prev.map((slot) =>
        slot.teamId === team.teamId ? { ...slot, teamId: null, teamName: null } : slot,
      );
      return cleaned.map((slot) =>
        slot.rank === rank ? { rank, teamId: team.teamId, teamName: team.teamName } : slot,
      );
    });
    setDirty(true);
    setTeamPickerOpenForRank(0);
  }, []);

  const handleClearBoot = useCallback(() => {
    setGoldenBoot({ playerId: null, playerName: null, teamId: null });
    setDirty(true);
  }, []);

  const handleClearRank = useCallback((rank: 1 | 2 | 3) => {
    setTopThree((prev) =>
      prev.map((slot) => (slot.rank === rank ? { rank, teamId: null, teamName: null } : slot)),
    );
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await tournamentPredictionsApi.save({
        competition: COMPETITION,
        goldenBoot: goldenBoot.playerId ? goldenBoot : null,
        topThree,
      });
      setDirty(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [goldenBoot, topThree]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  const bootTeam = goldenBoot.teamId ? teamsById.get(goldenBoot.teamId) : null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand">WORLD CUP · TOURNAMENT PICKS</Text>
            <Text variant="h1">Golden Boot &amp; Top 3</Text>
          </View>
          <PointsInfoButton scope="wc" />
        </View>
        <Text variant="body" color="secondary" style={styles.sub}>
          Pick the tournament's top scorer and the three teams you think will finish on the podium.
          Picks lock when the first match kicks off.
        </Text>
      </View>

      {locked && (
        <Card style={styles.lockBanner} padding="md">
          <View style={styles.lockRow}>
            <Ionicons name="lock-closed" size={18} color={colors.text.secondary} />
            <Text variant="bodyBold" color="secondary">Tournament started — picks are locked.</Text>
          </View>
        </Card>
      )}

      <Card style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>Golden Boot</Text>
        <Text variant="small" color="muted" style={styles.sectionHint}>
          The tournament's top goalscorer. Worth 15 pts if correct.
        </Text>
        <Pressable
          disabled={locked}
          onPress={() => setBootPickerOpen(true)}
          style={({ pressed }) => [
            styles.slot,
            pressed && !locked && styles.slotPressed,
            locked && styles.slotLocked,
          ]}
        >
          {goldenBoot.playerId ? (
            <View style={styles.slotFilled}>
              {bootTeam?.logo ? (
                <Image source={{ uri: bootTeam.logo }} style={styles.crest} resizeMode="contain" />
              ) : (
                <View style={[styles.crest, styles.crestFallback]} />
              )}
              <View style={styles.slotText}>
                <Text variant="bodyBold" numberOfLines={1}>{goldenBoot.playerName}</Text>
                <Text variant="small" color="muted" numberOfLines={1}>
                  {bootTeam?.teamName ?? 'Unknown team'}
                </Text>
              </View>
              {!locked && (
                <Pressable hitSlop={10} onPress={handleClearBoot}>
                  <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                </Pressable>
              )}
            </View>
          ) : (
            <View style={styles.slotEmpty}>
              <Ionicons name="football-outline" size={18} color={colors.text.muted} />
              <Text variant="body" color="muted">Tap to choose a player</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
            </View>
          )}
        </Pressable>
      </Card>

      <Card style={styles.section}>
        <Text variant="h3" style={styles.sectionTitle}>Top 3 teams</Text>
        <Text variant="small" color="muted" style={styles.sectionHint}>
          Champion · finalist · third place. Up to 10 / 6 / 4 pts + 2 pts for any team in the actual top 3.
        </Text>
        {topThree.map((slot) => {
          const team = slot.teamId ? teamsById.get(slot.teamId) : null;
          return (
            <Pressable
              key={slot.rank}
              disabled={locked}
              onPress={() => setTeamPickerOpenForRank(slot.rank)}
              style={({ pressed }) => [
                styles.slot,
                styles.slotInline,
                pressed && !locked && styles.slotPressed,
                locked && styles.slotLocked,
              ]}
            >
              <View style={[styles.rankBadge, rankBadgeStyles[slot.rank - 1]]}>
                <Text variant="bodyBold" color={slot.rank === 3 ? 'primary' : 'inverse'}>
                  {slot.rank}
                </Text>
              </View>
              {slot.teamId ? (
                <View style={styles.slotFilled}>
                  {team?.logo ? (
                    <Image source={{ uri: team.logo }} style={styles.crest} resizeMode="contain" />
                  ) : (
                    <View style={[styles.crest, styles.crestFallback]} />
                  )}
                  <View style={styles.slotText}>
                    <Text variant="bodyBold" numberOfLines={1}>{slot.teamName}</Text>
                  </View>
                  {!locked && (
                    <Pressable hitSlop={10} onPress={() => handleClearRank(slot.rank as 1 | 2 | 3)}>
                      <Ionicons name="close-circle" size={20} color={colors.text.muted} />
                    </Pressable>
                  )}
                </View>
              ) : (
                <View style={styles.slotEmpty}>
                  <Text variant="body" color="muted">
                    Pick {slot.rank === 1 ? 'champion' : slot.rank === 2 ? 'finalist' : 'third place'}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                </View>
              )}
            </Pressable>
          );
        })}
      </Card>

      {error && (
        <View style={styles.errorBar}>
          <Text variant="small" color="danger">{error}</Text>
        </View>
      )}

      {!locked && (
        <View style={styles.saveBar}>
          <Button
            label={dirty ? 'Save picks' : 'Saved'}
            onPress={save}
            loading={saving}
            disabled={!dirty}
          />
        </View>
      )}

      <GoldenBootPickerModal
        visible={bootPickerOpen}
        teams={teams ?? []}
        onClose={() => setBootPickerOpen(false)}
        onPick={handlePickPlayer}
      />

      <TeamPickerModal
        visible={teamPickerOpenForRank !== 0}
        teams={teams ?? []}
        excludedTeamIds={topThree.map((s) => s.teamId).filter((id): id is number => id !== null)}
        onClose={() => setTeamPickerOpenForRank(0)}
        onPick={(team) => {
          if (teamPickerOpenForRank !== 0) {
            handlePickTeamForRank(teamPickerOpenForRank, team);
          }
        }}
        title={
          teamPickerOpenForRank === 1 ? 'Pick the champion'
          : teamPickerOpenForRank === 2 ? 'Pick the finalist'
          : teamPickerOpenForRank === 3 ? 'Pick third place'
          : 'Pick a team'
        }
      />
    </Screen>
  );
}

// ---- Golden Boot picker: team list → squad → player ----

function GoldenBootPickerModal({
  visible,
  teams,
  onClose,
  onPick,
}: {
  visible: boolean;
  teams: CompetitionTeam[];
  onClose: () => void;
  onPick: (team: CompetitionTeam, player: SquadPlayer) => void;
}) {
  const [selectedTeam, setSelectedTeam] = useState<CompetitionTeam | null>(null);
  const [squad, setSquad] = useState<Squad | null>(null);
  const [squadLoading, setSquadLoading] = useState(false);
  const [squadError, setSquadError] = useState<string | null>(null);

  // Reset internal state every time the modal closes so reopen lands on the team list.
  useEffect(() => {
    if (!visible) {
      setSelectedTeam(null);
      setSquad(null);
      setSquadError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!selectedTeam) return;
    let cancelled = false;
    setSquadLoading(true);
    setSquadError(null);
    squadsApi
      .byTeam(selectedTeam.teamId)
      .then((s) => {
        if (!cancelled) setSquad(s);
      })
      .catch((e) => {
        if (!cancelled) setSquadError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setSquadLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeam]);

  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName)),
    [teams],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <View style={modalStyles.header}>
          {selectedTeam ? (
            <Pressable hitSlop={10} onPress={() => setSelectedTeam(null)}>
              <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
            </Pressable>
          ) : (
            <View style={{ width: 24 }} />
          )}
          <Text variant="h3">
            {selectedTeam ? selectedTeam.teamName : 'Pick a team'}
          </Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
        </View>

        {!selectedTeam ? (
          <FlatList
            data={sortedTeams}
            keyExtractor={(t) => String(t.teamId)}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setSelectedTeam(item)}
                style={({ pressed }) => [modalStyles.row, pressed && modalStyles.rowPressed]}
              >
                {item.logo ? (
                  <Image source={{ uri: item.logo }} style={styles.crest} resizeMode="contain" />
                ) : (
                  <View style={[styles.crest, styles.crestFallback]} />
                )}
                <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{item.teamName}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
              </Pressable>
            )}
          />
        ) : squadLoading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand.primary} /></View>
        ) : squadError ? (
          <View style={modalStyles.empty}>
            <Text variant="body" color="danger">Couldn't load squad: {squadError}</Text>
          </View>
        ) : (
          <FlatList
            data={squad?.squad ?? []}
            keyExtractor={(p) => String(p.id)}
            ListEmptyComponent={
              <View style={modalStyles.empty}>
                <Text variant="body" color="muted">No squad listed for this team yet.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onPick(selectedTeam, item)}
                style={({ pressed }) => [modalStyles.row, pressed && modalStyles.rowPressed]}
              >
                <View style={modalStyles.playerLabel}>
                  <Text variant="bodyBold" numberOfLines={1}>{item.name}</Text>
                  <Text variant="small" color="muted" numberOfLines={1}>{item.position}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

// ---- Top 3 team picker ----

function TeamPickerModal({
  visible,
  teams,
  excludedTeamIds,
  onClose,
  onPick,
  title,
}: {
  visible: boolean;
  teams: CompetitionTeam[];
  excludedTeamIds: number[];
  onClose: () => void;
  onPick: (team: CompetitionTeam) => void;
  title: string;
}) {
  const sortedTeams = useMemo(
    () => [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName)),
    [teams],
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.root}>
        <View style={modalStyles.header}>
          <View style={{ width: 24 }} />
          <Text variant="h3">{title}</Text>
          <Pressable hitSlop={10} onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.text.primary} />
          </Pressable>
        </View>
        <FlatList
          data={sortedTeams}
          keyExtractor={(t) => String(t.teamId)}
          renderItem={({ item }) => {
            const excluded = excludedTeamIds.includes(item.teamId);
            return (
              <Pressable
                onPress={() => onPick(item)}
                disabled={excluded}
                style={({ pressed }) => [
                  modalStyles.row,
                  pressed && !excluded && modalStyles.rowPressed,
                  excluded && modalStyles.rowDisabled,
                ]}
              >
                {item.logo ? (
                  <Image source={{ uri: item.logo }} style={styles.crest} resizeMode="contain" />
                ) : (
                  <View style={[styles.crest, styles.crestFallback]} />
                )}
                <Text variant="bodyBold" style={{ flex: 1 }} numberOfLines={1}>{item.teamName}</Text>
                {excluded ? (
                  <Text variant="caption" color="muted">PICKED</Text>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sub: { marginTop: spacing.xs, lineHeight: 21 },
  section: { marginBottom: spacing.md, gap: spacing.sm },
  sectionTitle: {},
  sectionHint: { marginBottom: spacing.sm },
  lockBanner: { marginBottom: spacing.md, backgroundColor: colors.surface.cardSubtle },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  slot: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.surface.cardSubtle,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
  slotInline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  slotPressed: { opacity: 0.7 },
  slotLocked: { opacity: 0.6 },
  slotEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    justifyContent: 'space-between',
  },
  slotFilled: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  slotText: { flex: 1 },
  crest: { width: 28, height: 28 },
  crestFallback: { backgroundColor: colors.surface.cardSubtle, borderRadius: radii.sm },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  errorBar: {
    backgroundColor: colors.state.dangerBg,
    padding: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.md,
  },
  saveBar: { marginTop: spacing.lg, marginBottom: spacing.xl },
});

const rankBadgeStyles = [
  { backgroundColor: colors.state.success },     // 1st: green
  { backgroundColor: colors.brand.secondary },   // 2nd: blue
  { backgroundColor: colors.brand.accent },      // 3rd: amber
] as const;

const modalStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
    backgroundColor: colors.surface.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  rowPressed: { backgroundColor: colors.surface.cardSubtle },
  rowDisabled: { opacity: 0.45 },
  empty: { padding: spacing.xl, alignItems: 'center' },
  playerLabel: { flex: 1 },
});
