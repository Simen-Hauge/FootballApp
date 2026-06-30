import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Screen, Text } from '@/components/ui';
import {
  getWorldCupGroupStandings,
  groupLetter,
  wcGroupPredictionsApi,
  type GroupPredictionsResponse,
  type ServerGroupPrediction,
  type ApiStandingGroup,
  type ApiTeam,
} from '@/api/wc';
import {
  calculateGroupStandingBreakdown,
  sumGroupStandingBreakdown,
} from '@/wc/groupStandingScoring';
import {
  loadGroupPredictions,
  saveGroupPredictions,
  type GroupPredictions,
} from '@/wc/groupPredictionStorage';
import { useAuth } from '@/auth/AuthContext';
import { PointsInfoButton } from '@/components/PointsInfoModal';
import { colors, radii, shadows, spacing } from '@/theme';

export default function WCGroupStage() {
  const { session } = useAuth();
  const [groups, setGroups] = useState<ApiStandingGroup[] | null>(null);
  const [serverPredictions, setServerPredictions] = useState<ServerGroupPrediction[]>([]);
  const [predictions, setPredictions] = useState<GroupPredictions>({});
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [fetchedGroups, localPreds, serverPredRes] = await Promise.all([
          getWorldCupGroupStandings(),
          loadGroupPredictions(),
          session
            ? wcGroupPredictionsApi.list(session.email).catch(
                () => ({ predictions: [], locked: false }) as GroupPredictionsResponse,
              )
            : Promise.resolve({ predictions: [], locked: false }),
        ]);
        if (cancelled) return;
        // Server is the source of truth when present; fall back to local.
        const serverMap: GroupPredictions = {};
        for (const sp of serverPredRes.predictions) {
          serverMap[sp.groupCode] = sp.rankedTeamIds;
        }
        const merged: GroupPredictions = { ...localPreds, ...serverMap };
        setGroups(fetchedGroups);
        setServerPredictions(serverPredRes.predictions);
        setLocked(serverPredRes.locked);
        setPredictions(seedPredictions(fetchedGroups, merged));
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

  const reorderGroup = useCallback((groupCode: string, newOrderIds: number[]) => {
    if (locked) return;
    setPredictions((prev) => ({ ...prev, [groupCode]: newOrderIds }));
    setDirty(true);
  }, [locked]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveGroupPredictions(predictions);
      if (session) {
        await wcGroupPredictionsApi.bulkSave(session.email, predictions);
      }
      setDirty(false);
    } catch (e) {
      // Local save succeeded but server save failed — keep dirty so user can retry.
      setError(`Saved locally but couldn't sync to server: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }, [predictions, session]);

  const completedCount = useMemo(() => {
    if (!groups) return 0;
    return groups.filter((g) => (predictions[g.group ?? ''] ?? []).length === g.table.length).length;
  }, [groups, predictions]);

  const serverPredictionsByGroup = useMemo(
    () => new Map(serverPredictions.map((pred) => [pred.groupCode, pred] as const)),
    [serverPredictions],
  );

  const totalResolvedPoints = useMemo(
    () => serverPredictions.reduce((sum, pred) => sum + (pred.pointsAwarded ?? 0), 0),
    [serverPredictions],
  );

  if (loading) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !groups || groups.length === 0) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text variant="caption" color="brand">WORLD CUP · GROUP STAGE</Text>
          <Text variant="h1">No standings yet</Text>
        </View>
        <Card>
          <Text variant="body" color="secondary">
            {error
              ? `Couldn't load groups: ${error}`
              : 'football-data.org has no group standings for the tournament yet — check back closer to kickoff.'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" color="brand">WORLD CUP · GROUP STAGE</Text>
            <Text variant="h1">Predict the groups</Text>
          </View>
          <PointsInfoButton scope="wc" />
        </View>
        <Text variant="body" color="secondary" style={styles.sub}>
          Drag teams to predict how each of the {groups.length} groups will finish.
          Top 2 + best 8 third-placed teams advance to the Round of 32.
        </Text>
        <Text variant="caption" color="muted" style={styles.progress}>
          {completedCount} / {groups.length} GROUPS PREDICTED
        </Text>
        {locked ? (
          <Card style={styles.lockedCard} padding="md">
            <View style={styles.lockedRow}>
              <Ionicons name="lock-closed" size={16} color={colors.text.secondary} />
              <Text variant="bodyBold" color="secondary">Group-stage picks are locked.</Text>
            </View>
            <Text variant="small" color="muted">
              {totalResolvedPoints > 0
                ? `You have ${totalResolvedPoints} points banked from resolved group standings.`
                : 'The tournament has started, so these picks can no longer be changed.'}
            </Text>
          </Card>
        ) : null}
      </View>

      {groups.map((g) => {
        const order = predictions[g.group ?? ''] ?? g.table.map((row) => row.team.id);
        const teamsById = new Map(g.table.map((row) => [row.team.id, row.team] as const));
        const items = order.map((id) => teamsById.get(id)).filter(Boolean) as ApiTeam[];
        const resolvedPrediction = serverPredictionsByGroup.get(g.group ?? '');
        const breakdown = resolvedPrediction?.pointsAwarded != null
          ? calculateGroupStandingBreakdown(order, g)
          : [];
        const resolvedTotal = breakdown.length > 0 ? sumGroupStandingBreakdown(breakdown) : null;

        return (
          <Card key={g.group} style={styles.groupCard} padding={0}>
            <View style={styles.groupHeader}>
              <View style={styles.groupHeaderMain}>
                <View style={styles.groupBadge}>
                  <Text variant="bodyBold" color="inverse">{groupLetter(g.group)}</Text>
                </View>
                <View style={styles.groupTitleWrap}>
                  <Text variant="h3">Group {groupLetter(g.group)}</Text>
                  {resolvedTotal != null ? (
                    <Text variant="small" color="secondary">Resolved for +{resolvedTotal} pts</Text>
                  ) : locked ? (
                    <Text variant="small" color="muted">Locked</Text>
                  ) : null}
                </View>
              </View>
              {resolvedTotal != null ? (
                <View style={styles.groupPointsBadge}>
                  <Text variant="caption" color="inverse">+{resolvedTotal}</Text>
                </View>
              ) : null}
            </View>

            <DraggableFlatList
              data={items}
              keyExtractor={(team) => String(team.id)}
              onDragEnd={({ data }) => reorderGroup(g.group as string, data.map((t) => t.id))}
              scrollEnabled={false}
              activationDistance={6}
              renderItem={({ item, drag, isActive, getIndex }) => (
                <DraggableTeamRow
                  team={item}
                  drag={locked ? () => {} : drag}
                  isActive={isActive && !locked}
                  position={(getIndex() ?? 0) + 1}
                  breakdownRow={breakdown.find((row) => row.teamId === item.id)}
                  locked={locked}
                />
              )}
            />

            {resolvedTotal != null ? (
              <View style={styles.resultsBar}>
                <Text variant="small" color="secondary">
                  Actual finish: {g.table.map((row) => row.team.shortName || row.team.name).join(' · ')}
                </Text>
              </View>
            ) : null}
          </Card>
        );
      })}

      {error ? (
        <View style={styles.errorBar}>
          <Text variant="small" color="danger">{error}</Text>
        </View>
      ) : null}

      <View style={styles.saveBar}>
        <Button
          label={locked ? 'Predictions locked' : dirty ? 'Save predictions' : 'Saved'}
          onPress={save}
          loading={saving}
          disabled={locked || !dirty}
        />
      </View>
    </Screen>
  );
}

function DraggableTeamRow({
  team,
  drag,
  isActive,
  position,
  breakdownRow,
  locked,
}: {
  team: ApiTeam;
  drag: () => void;
  isActive: boolean;
  position: number;
  breakdownRow?: ReturnType<typeof calculateGroupStandingBreakdown>[number];
  locked: boolean;
}) {
  return (
    <ScaleDecorator>
      <View
        onTouchStart={locked ? undefined : drag}
        style={[styles.teamRow, isActive && styles.teamRowActive]}
      >
        <View style={[styles.positionBadge, positionStyles[position - 1]]}>
          <Text variant="bodyBold" color={position <= 2 ? 'inverse' : 'primary'}>{position}</Text>
        </View>
        {team.crest ? (
          <Image source={{ uri: team.crest }} style={styles.crest} resizeMode="contain" />
        ) : (
          <View style={[styles.crest, styles.crestFallback]} />
        )}
        <View style={styles.teamNameWrap}>
          <Text variant="bodyBold" numberOfLines={1}>{team.shortName || team.name}</Text>
          {breakdownRow?.actualPosition != null ? (
            <Text variant="small" color="muted">
              Finished {ordinal(breakdownRow.actualPosition)} · +{breakdownRow.points} pts
            </Text>
          ) : null}
        </View>
        {breakdownRow?.actualPosition != null ? (
          <View style={[styles.pointsPill, breakdownRow.points > 0 ? styles.pointsPillWin : styles.pointsPillZero]}>
            <Text variant="caption" color={breakdownRow.points > 0 ? 'inverse' : 'secondary'}>
              +{breakdownRow.points}
            </Text>
          </View>
        ) : null}
        {!locked ? <Ionicons name="reorder-three" size={22} color={colors.text.muted} /> : null}
      </View>
    </ScaleDecorator>
  );
}

function ordinal(position: number) {
  if (position === 1) return '1st';
  if (position === 2) return '2nd';
  if (position === 3) return '3rd';
  return `${position}th`;
}

function seedPredictions(groups: ApiStandingGroup[], saved: GroupPredictions): GroupPredictions {
  const next: GroupPredictions = { ...saved };
  for (const g of groups) {
    if (!g.group) continue;
    const apiTeamIds = g.table.map((row) => row.team.id);
    const existing = next[g.group];
    if (!existing || existing.length !== apiTeamIds.length || !existing.every((id) => apiTeamIds.includes(id))) {
      next[g.group] = apiTeamIds;
    }
  }
  return next;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sub: { marginTop: spacing.xs, lineHeight: 21 },
  progress: { marginTop: spacing.sm },
  lockedCard: { marginTop: spacing.md, gap: spacing.xs },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  groupCard: { marginBottom: spacing.md, overflow: 'hidden' },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  groupHeaderMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  groupBadge: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  groupTitleWrap: { flex: 1 },
  groupPointsBadge: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.state.success,
    alignItems: 'center',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  teamRowActive: { backgroundColor: colors.surface.cardSubtle, ...shadows.md },
  positionBadge: {
    width: 26,
    height: 26,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crest: { width: 28, height: 28 },
  crestFallback: { backgroundColor: colors.surface.cardSubtle, borderRadius: radii.sm },
  teamNameWrap: { flex: 1 },
  pointsPill: {
    minWidth: 44,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  pointsPillWin: { backgroundColor: colors.state.success },
  pointsPillZero: { backgroundColor: colors.surface.cardSubtle },
  resultsBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface.cardSubtle,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  errorBar: { backgroundColor: colors.state.dangerBg, padding: spacing.md, borderRadius: radii.md, marginBottom: spacing.md },
  saveBar: { marginTop: spacing.lg, marginBottom: spacing.xl },
});

const positionStyles = [
  { backgroundColor: colors.state.success }, // 1st: advance
  { backgroundColor: colors.brand.secondary }, // 2nd: advance
  { backgroundColor: colors.brand.accent }, // 3rd: maybe advance
  { backgroundColor: colors.surface.cardSubtle }, // 4th: out
] as const;
