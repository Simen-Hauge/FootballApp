import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { groupsApi, type GroupDetail } from '@/api/groups';
import { colors, radii, spacing } from '@/theme';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      groupsApi
        .get(id)
        .then((g) => {
          if (cancelled) return;
          setGroup(g);
          setError(null);
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
    }, [id]),
  );

  const copyCode = async () => {
    if (!group?.joinCode) return;
    await Clipboard.setStringAsync(group.joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareGroup = async () => {
    if (!group?.joinCode) return;
    const deepLink = `footyguru://group/join?code=${group.joinCode}`;
    try {
      await Share.share({
        message: `Join my FootyGuru group "${group.groupName}"!\nOpen the app: ${deepLink}\nOr enter code ${group.joinCode} manually.`,
        url: deepLink,
      });
    } catch {
      // User cancelled or platform doesn't support — fall back to copy.
      await copyCode();
    }
  };

  if (loading && !group) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand.primary} />
        </View>
      </Screen>
    );
  }
  if (error || !group) {
    return (
      <Screen>
        <Card><Text variant="body" color="danger">{error ?? 'Group not found.'}</Text></Card>
      </Screen>
    );
  }

  const sortedMembers = [...group.members].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="brand">{group.tournament.toUpperCase()}</Text>
        <Text variant="h1">{group.groupName}</Text>
      </View>

      <Card style={styles.codeCard}>
        <Text variant="caption" color="secondary">JOIN CODE</Text>
        <Text style={styles.codeText}>{group.joinCode || '—'}</Text>
        <View style={styles.codeActions}>
          <Pressable
            onPress={copyCode}
            accessibilityLabel="Copy join code"
            hitSlop={6}
            style={({ pressed }) => [styles.codeAction, pressed && styles.codeActionPressed]}
          >
            <Ionicons
              name={copied ? 'checkmark-circle' : 'copy-outline'}
              size={16}
              color={copied ? colors.state.success : colors.text.primary}
            />
            <Text variant="bodyBold" color={copied ? 'success' : 'primary'}>
              {copied ? 'Copied' : 'Copy'}
            </Text>
          </Pressable>
          <Pressable
            onPress={shareGroup}
            accessibilityLabel="Share group invite"
            hitSlop={6}
            style={({ pressed }) => [styles.codeAction, styles.codeActionPrimary, pressed && styles.codeActionPressed]}
          >
            <Ionicons name="share-outline" size={16} color={colors.text.inverse} />
            <Text variant="bodyBold" color="inverse">Share</Text>
          </Pressable>
        </View>
      </Card>

      <View style={styles.section}>
        <View style={styles.scoreboardHeader}>
          <Text variant="h3" style={styles.sectionTitle}>Scoreboard</Text>
          <Text variant="caption" color="muted">
            {sortedMembers.length} {sortedMembers.length === 1 ? 'player' : 'players'}
          </Text>
        </View>
        <Card padding={0}>
          <View style={styles.tableHead}>
            <Text variant="caption" color="muted" style={styles.colRank}>#</Text>
            <Text variant="caption" color="muted" style={styles.colName}>PLAYER</Text>
            <Text variant="caption" color="muted" style={styles.colPoints}>PTS</Text>
          </View>
          {sortedMembers.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text variant="small" color="muted">No players yet — share the code to get started.</Text>
            </View>
          ) : (
            sortedMembers.map((m, idx) => {
              const isYou = session?.email?.toLowerCase() === m.email.toLowerCase();
              const points = m.points ?? 0;
              const leaderPoints = sortedMembers[0]?.points ?? 0;
              const gap = leaderPoints - points;
              const isFirst = idx === 0;
              return (
                <View
                  key={m._id}
                  style={[
                    styles.memberRow,
                    isYou && styles.memberRowSelf,
                    idx === sortedMembers.length - 1 && styles.memberRowLast,
                  ]}
                >
                  <View style={[styles.rank, isFirst && styles.rankFirst, isYou && !isFirst && styles.rankSelf]}>
                    {isFirst ? (
                      <Ionicons name="trophy" size={14} color={colors.text.onAccent} />
                    ) : (
                      <Text variant="bodyBold" color={isYou ? 'inverse' : 'primary'}>{idx + 1}</Text>
                    )}
                  </View>
                  <View style={styles.memberNameWrap}>
                    <Text variant="bodyBold" numberOfLines={1}>{m.name}</Text>
                    {isYou ? <Text variant="caption" color="brand">YOU</Text> : null}
                  </View>
                  <View style={styles.pointsCol}>
                    <Text variant="bodyBold">{points}</Text>
                    {isFirst ? (
                      <Text variant="caption" color="muted">leader</Text>
                    ) : gap > 0 ? (
                      <Text variant="caption" color="muted">-{gap}</Text>
                    ) : (
                      <Text variant="caption" color="muted">tied</Text>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </Card>
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={() => router.push({ pathname: '/group/settings', params: { groupId: group.id } })}
          style={({ pressed }) => [styles.settingsLink, pressed && { opacity: 0.5 }]}
        >
          <Ionicons name="settings-outline" size={14} color={colors.text.muted} />
          <Text variant="small" color="muted">Group settings</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  codeCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  codeText: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.brand.primary,
    fontVariant: ['tabular-nums'],
  },
  codeActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  codeAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.cardSubtle,
  },
  codeActionPrimary: { backgroundColor: colors.brand.primary },
  codeActionPressed: { opacity: 0.7 },
  section: { gap: spacing.md, marginBottom: spacing.lg },
  sectionTitle: { marginLeft: spacing.xs },
  scoreboardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  colRank: { width: 28, letterSpacing: 1 },
  colName: { flex: 1, letterSpacing: 1 },
  colPoints: { minWidth: 44, textAlign: 'right', letterSpacing: 1 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  memberRowSelf: { backgroundColor: colors.brand.primaryLight },
  memberRowLast: { borderBottomWidth: 0 },
  rank: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.cardSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankFirst: { backgroundColor: colors.brand.accent },
  rankSelf: { backgroundColor: colors.brand.primary },
  memberNameWrap: { flex: 1, gap: 2 },
  pointsCol: { alignItems: 'flex-end', minWidth: 44 },
  emptyRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  footer: { alignItems: 'center', paddingVertical: spacing.lg, marginBottom: spacing.xl },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
});
