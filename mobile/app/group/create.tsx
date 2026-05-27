import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useGamemode, GAMEMODES, SERVER_GAMEMODE_ID, type Gamemode } from '@/gamemode';
import { groupsApi, type GroupSummary } from '@/api/groups';
import { ApiError } from '@/api/client';
import { colors, radii, spacing } from '@/theme';

const TOURNAMENT_FOR_MODE: Record<Gamemode, string> = {
  'premier-league': 'Premier League',
  'world-cup': 'World Cup',
  'champions-league': 'Champions League',
};

export default function CreateGroupScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { gamemode: currentMode, allowedList } = useGamemode();

  const [selectedMode, setSelectedMode] = useState<Gamemode>(currentMode);
  const [groupName, setGroupName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GroupSummary | null>(null);

  const selectedMeta = GAMEMODES[selectedMode];

  const handleCreate = async () => {
    if (!session) {
      setError('You need to sign in first.');
      return;
    }
    if (!groupName.trim()) {
      setError('Give the group a name.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await groupsApi.create({
        groupName: groupName.trim(),
        tournament: TOURNAMENT_FOR_MODE[selectedMode],
        gamemode: SERVER_GAMEMODE_ID[selectedMode],
        email: session.email,
      });
      setCreated(res.group);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.status === 409 ? 'That name is taken. Try another.' : e.message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (created) {
    return (
      <Screen>
        <View style={styles.header}>
          <Text variant="caption" color="brand">GROUP CREATED</Text>
          <Text variant="h1">{created.groupName}</Text>
          <Text variant="body" color="secondary">{selectedMeta.label}</Text>
        </View>

        <Card style={styles.codeCard}>
          <Text variant="caption" color="secondary">SHARE THIS CODE</Text>
          <Text style={styles.codeText}>{created.joinCode}</Text>
          <Text variant="small" color="muted" align="center">
            Friends paste this in "Join with code" to enter your group.
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button label="Open group" onPress={() => router.replace(`/group/${created._id}`)} />
          <Button label="Back to groups" variant="secondary" onPress={() => router.replace('/(tabs)/groups')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="caption" color="brand">NEW GROUP</Text>
        <Text variant="h1">Create a group</Text>
      </View>

      <Card style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <Text variant="caption" color="secondary">GAMEMODE</Text>
          <View style={styles.picker}>
            {allowedList.map((mode) => {
              const active = mode.id === selectedMode;
              return (
                <Pressable
                  key={mode.id}
                  onPress={() => setSelectedMode(mode.id)}
                  style={({ pressed }) => [
                    styles.pickerOption,
                    active ? styles.pickerOptionActive : styles.pickerOptionInactive,
                    pressed && !active && styles.pickerOptionPressed,
                  ]}
                >
                  <Ionicons
                    name={mode.icon}
                    size={16}
                    color={active ? colors.text.inverse : colors.text.secondary}
                  />
                  <Text
                    variant="bodyBold"
                    style={[styles.pickerLabel, active ? styles.pickerLabelActive : styles.pickerLabelInactive]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="small" color="muted" style={styles.helper}>
            Members compete on {TOURNAMENT_FOR_MODE[selectedMode]} predictions.
          </Text>
        </View>

        <Input
          label="Group name"
          value={groupName}
          onChangeText={setGroupName}
          placeholder="e.g. Friday night punters"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleCreate}
        />

        {error ? (
          <View style={styles.errorBox}>
            <Text variant="small" color="danger">{error}</Text>
          </View>
        ) : null}

        <Button label="Create" onPress={handleCreate} loading={submitting} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: spacing.sm, marginBottom: spacing.lg, gap: spacing.xs },
  formCard: { gap: spacing.lg },
  fieldGroup: { gap: spacing.xs },
  picker: {
    flexDirection: 'row',
    backgroundColor: colors.surface.cardSubtle,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
    marginTop: spacing.xs,
  },
  pickerOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
  },
  pickerOptionActive: { backgroundColor: colors.brand.primary },
  pickerOptionInactive: { backgroundColor: 'transparent' },
  pickerOptionPressed: { backgroundColor: colors.surface.card },
  pickerLabel: { fontSize: 14 },
  pickerLabelActive: { color: colors.text.inverse },
  pickerLabelInactive: { color: colors.text.secondary },
  helper: { marginTop: spacing.xs },
  codeCard: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  codeText: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 6,
    color: colors.brand.primary,
    fontVariant: ['tabular-nums'],
  },
  actions: { gap: spacing.sm },
  errorBox: {
    backgroundColor: colors.state.dangerBg,
    padding: spacing.md,
    borderRadius: radii.md,
  },
});
