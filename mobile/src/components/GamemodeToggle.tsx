import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { colors, radii, shadows, spacing } from '@/theme';
import { useGamemode } from '@/gamemode';

export function GamemodeToggle() {
  const { gamemode, setGamemode, allowedList } = useGamemode();

  // No toggle needed when the user only has one mode (e.g. WC-only public).
  if (allowedList.length <= 1) return null;

  return (
    <View style={styles.wrapper}>
      {allowedList.map((mode) => {
        const active = mode.id === gamemode;
        return (
          <Pressable
            key={mode.id}
            onPress={() => setGamemode(mode.id)}
            style={({ pressed }) => [
              styles.pill,
              active ? styles.pillActive : styles.pillInactive,
              pressed && !active && styles.pillPressed,
            ]}
          >
            <Ionicons
              name={mode.icon}
              size={16}
              color={active ? colors.text.inverse : colors.text.secondary}
            />
            <Text
              variant="bodyBold"
              style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
            >
              {mode.shortLabel}
            </Text>
            {mode.limited ? (
              <View style={[styles.badge, active ? styles.badgeOnActive : styles.badgeOnInactive]}>
                <Text variant="caption" style={[styles.badgeLabel, active ? styles.badgeLabelOnActive : styles.badgeLabelOnInactive]}>
                  LIVE
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    backgroundColor: colors.surface.cardSubtle,
    borderRadius: radii.pill,
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  pillActive: {
    backgroundColor: colors.brand.primary,
    ...shadows.sm,
  },
  pillInactive: { backgroundColor: 'transparent' },
  pillPressed: { backgroundColor: colors.surface.card },
  label: { fontSize: 14 },
  labelActive: { color: colors.text.inverse },
  labelInactive: { color: colors.text.secondary },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    marginLeft: 2,
  },
  badgeOnActive: { backgroundColor: colors.brand.accent },
  badgeOnInactive: { backgroundColor: colors.brand.accent },
  badgeLabel: { fontSize: 9, letterSpacing: 0.5 },
  badgeLabelOnActive: { color: colors.text.onAccent },
  badgeLabelOnInactive: { color: colors.text.onAccent },
});
