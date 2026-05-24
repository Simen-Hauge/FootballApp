import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { groupsApi, type GroupDetail, type GroupMember } from '@/api/groups';
import { colors, radii, spacing } from '@/theme';

type BusyKey =
  | 'reset'
  | 'leave'
  | 'rename'
  | 'delete'
  | `kick:${string}`
  | `promote:${string}`
  | null;

export default function GroupSettingsScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const router = useRouter();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(() => {
    if (!groupId) return;
    setLoading(true);
    groupsApi
      .get(groupId)
      .then((g) => {
        setGroup(g);
        setRenameValue(g.groupName);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  const isOwner = !!session?.email && session.email.toLowerCase() === group.owner.toLowerCase();

  const handleRename = async () => {
    if (!session) return;
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === group.groupName) return;
    setBusy('rename');
    try {
      await groupsApi.rename(group.id, session.email, trimmed);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleReset = () =>
    confirm(
      'Reset all scores?',
      "Every member's points go back to 0. This can't be undone.",
      'Reset',
      async () => {
        setBusy('reset');
        try {
          await groupsApi.resetScores(group.id);
          load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(null);
        }
      },
    );

  const handleDelete = () =>
    confirm(
      'Delete this group?',
      `${group.groupName} will be removed for everyone, along with all members and predictions inside. This can't be undone.`,
      'Delete',
      async () => {
        if (!session) return;
        setBusy('delete');
        try {
          await groupsApi.remove(group.id, session.email);
          router.replace('/(tabs)/groups');
        } catch (e) {
          setError((e as Error).message);
          setBusy(null);
        }
      },
    );

  const handleLeave = () =>
    confirm(
      'Leave this group?',
      `You'll stop competing in ${group.groupName}. You can rejoin later with the code.`,
      'Leave',
      async () => {
        if (!session) return;
        setBusy('leave');
        try {
          await groupsApi.removePlayer(group.id, session.email);
          router.replace('/(tabs)/groups');
        } catch (e) {
          setError((e as Error).message);
          setBusy(null);
        }
      },
    );

  const handleKick = (member: GroupMember) =>
    confirm(
      `Remove ${member.name}?`,
      `${member.name} will be removed from ${group.groupName}. They can rejoin if they have the code.`,
      'Remove',
      async () => {
        setBusy(`kick:${member._id}`);
        try {
          await groupsApi.removePlayer(group.id, member.email);
          load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(null);
        }
      },
    );

  const handlePromote = (member: GroupMember) =>
    confirm(
      `Make ${member.name} the leader?`,
      `${member.name} will take over as group owner. You'll go back to being a regular member and lose owner controls (rename, kick, delete, reset scores).`,
      'Make leader',
      async () => {
        setBusy(`promote:${member._id}`);
        try {
          await groupsApi.transferOwnership(group.id, member.email);
          load();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(null);
        }
      },
    );

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="brand">GROUP SETTINGS</Text>
        <Text variant="h1">{group.groupName}</Text>
        <Text variant="body" color="secondary">{group.tournament}</Text>
      </View>

      {isOwner ? (
        <Card style={styles.section}>
          <Text variant="h3">Rename group</Text>
          <Text variant="small" color="muted">Everyone sees the new name immediately.</Text>
          <Input value={renameValue} onChangeText={setRenameValue} returnKeyType="done" onSubmitEditing={handleRename} />
          <Button
            label="Save name"
            onPress={handleRename}
            loading={busy === 'rename'}
            disabled={renameValue.trim() === group.groupName || renameValue.trim().length === 0}
          />
        </Card>
      ) : null}

      <Card style={styles.section} padding={0}>
        <View style={styles.sectionHead}>
          <Text variant="h3">Members ({group.members.length})</Text>
        </View>
        {group.members.map((m, idx) => {
          const isMemberOwner = m.email.toLowerCase() === group.owner.toLowerCase();
          const isYou = session?.email?.toLowerCase() === m.email.toLowerCase();
          return (
            <View
              key={m._id}
              style={[styles.memberRow, idx === group.members.length - 1 && styles.memberRowLast]}
            >
              <View style={styles.memberInfo}>
                <Text variant="bodyBold">{m.name}</Text>
                <View style={styles.memberMeta}>
                  {isMemberOwner ? <Tag label="OWNER" color={colors.brand.primary} /> : null}
                  {isYou ? <Tag label="YOU" color={colors.brand.secondary} /> : null}
                  <Text variant="small" color="muted">{m.points ?? 0} pts</Text>
                </View>
              </View>
              {isOwner && !isMemberOwner ? (
                <View style={styles.memberActions}>
                  <Pressable
                    onPress={() => handlePromote(m)}
                    hitSlop={8}
                    accessibilityLabel={`Make ${m.name} the leader`}
                    style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
                  >
                    {busy === `promote:${m._id}` ? (
                      <ActivityIndicator size="small" color={colors.brand.primary} />
                    ) : (
                      <Ionicons name="ribbon-outline" size={18} color={colors.brand.primary} />
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => handleKick(m)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${m.name}`}
                    style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.5 }]}
                  >
                    {busy === `kick:${m._id}` ? (
                      <ActivityIndicator size="small" color={colors.state.danger} />
                    ) : (
                      <Ionicons name="person-remove-outline" size={18} color={colors.state.danger} />
                    )}
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Text variant="caption" color="muted" style={styles.dangerLabel}>DANGER ZONE</Text>

      {isOwner ? (
        <>
          <ActionCard
            title="Reset all scores"
            description="Sends every member back to 0 points. Use at the start of a new season."
            buttonLabel="Reset scores"
            variant="secondary"
            loading={busy === 'reset'}
            onPress={handleReset}
          />
          <ActionCard
            title="Delete group"
            description="Permanently removes the group for everyone. Cannot be undone."
            buttonLabel="Delete"
            variant="danger"
            loading={busy === 'delete'}
            onPress={handleDelete}
          />
        </>
      ) : (
        <ActionCard
          title="Leave group"
          description="You can rejoin any time with the code."
          buttonLabel="Leave"
          variant="danger"
          loading={busy === 'leave'}
          onPress={handleLeave}
        />
      )}
    </Screen>
  );
}

function ActionCard({
  title,
  description,
  buttonLabel,
  variant,
  loading,
  onPress,
}: {
  title: string;
  description: string;
  buttonLabel: string;
  variant: 'secondary' | 'danger';
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Card style={styles.actionCard}>
      <View style={styles.actionText}>
        <Text variant="bodyBold">{title}</Text>
        <Text variant="small" color="muted">{description}</Text>
      </View>
      <Button label={buttonLabel} variant={variant} onPress={onPress} loading={loading} fullWidth={false} />
    </Card>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color }]}>
      <Text variant="caption" color="inverse" style={styles.tagText}>{label}</Text>
    </View>
  );
}

function confirm(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { marginTop: spacing.sm, marginBottom: spacing.xl, gap: spacing.xs },
  section: { gap: spacing.sm, marginBottom: spacing.lg },
  sectionHead: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border.subtle },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    gap: spacing.md,
  },
  memberRowLast: { borderBottomWidth: 0 },
  memberInfo: { flex: 1, gap: spacing.xs },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.sm },
  tagText: { fontSize: 9 },
  memberActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconButton: { padding: spacing.xs },
  kickButton: { padding: spacing.xs },
  dangerLabel: { marginLeft: spacing.xs, marginBottom: spacing.sm },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  actionText: { flex: 1, gap: 2 },
});
