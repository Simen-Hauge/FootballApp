import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui';
import { colors, radii, spacing } from '@/theme';
import {
  DEFAULT_POINTS_CONFIG,
  getPointsConfig,
  type PointsConfig,
} from '@/api/pointsConfig';

export type PointsInfoScope = 'all' | 'match' | 'wc';

interface PointsInfoModalProps {
  visible: boolean;
  onClose: () => void;
  // Restrict which sections show — match-detail screens don't need the WC
  // tournament-wide block, and vice versa. Defaults to 'all'.
  scope?: PointsInfoScope;
}

export function PointsInfoModal({ visible, onClose, scope = 'all' }: PointsInfoModalProps) {
  const [config, setConfig] = useState<PointsConfig>(DEFAULT_POINTS_CONFIG);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getPointsConfig().then((cfg) => {
      if (alive) setConfig(cfg);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const showMatch = scope === 'all' || scope === 'match' || scope === 'wc';
  const showWc = scope === 'all' || scope === 'wc';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <Text variant="h2">How points work</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {showMatch && (
              <Section title="Match predictions">
                <Row label="Exact score" value={`+${config.match.exactScore}`} />
                <Row label="Correct outcome (W/D/L)" value={`+${config.match.correctOutcome}`} />
                <Row label="Correct goal difference" value={`+${config.match.correctGoalDifference}`} />
                <Row label="One team's score correct" value={`+${config.match.oneTeamScoreCorrect}`} />
                <Row label="Otherwise" value={`+${config.match.miss}`} />
                <Note>
                  Exact score is the premium hit. We award only the single highest
                  tier for each match prediction.
                </Note>
              </Section>
            )}

            {showMatch && (
              <Section title="First goal scorer">
                <Row label="Correct first scorer" value={`+${config.firstGoalScorer.exact}`} />
                <Row label="Wrong (or unset)" value={`+${config.firstGoalScorer.miss}`} />
                <Note>This bonus is added on top of your match prediction points.</Note>
              </Section>
            )}

            {showWc && (
              <Section title="Group standings">
                <Row label="Exact finishing position" value={`+${config.groupStanding.exactPosition}`} />
                <Row label="Off by one place" value={`+${config.groupStanding.offByOne}`} />
                <Row label="Off by two places" value={`+${config.groupStanding.offByTwo}`} />
                <Row label="Off by three or more" value={`+${config.groupStanding.offByThreeOrMore}`} />
                <Note>Scored per team, then summed across each group.</Note>
              </Section>
            )}

            {showWc && (
              <Section title="Golden Boot">
                <Row label="Correct top scorer" value={`+${config.goldenBoot.exact}`} />
                <Row label="Otherwise" value={`+${config.goldenBoot.miss}`} />
                <Note>Pick locks once the tournament's first match kicks off.</Note>
              </Section>
            )}

            {showWc && (
              <Section title="Top 3 teams">
                <Row label="Correct champion (1st)" value={`+${config.topThree.champion}`} />
                <Row label="Correct finalist (2nd)" value={`+${config.topThree.finalist}`} />
                <Row label="Correct third place" value={`+${config.topThree.third}`} />
                <Row
                  label="Team in top 3 but wrong slot"
                  value={`+${config.topThree.teamInTopThreeBonus}`}
                />
                <Note>
                  Exact-position points and partial-credit bonuses combine — your
                  champion pick can earn {config.topThree.champion} pts even if your other slots miss.
                </Note>
              </Section>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Convenience trigger button — drop one of these into any screen header.
export function PointsInfoButton({
  scope = 'all',
  tint = 'muted',
}: {
  scope?: PointsInfoScope;
  tint?: 'muted' | 'inverse' | 'brand';
}) {
  const [open, setOpen] = useState(false);
  const color =
    tint === 'inverse' ? colors.text.inverse
    : tint === 'brand' ? colors.brand.primary
    : colors.text.secondary;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={10} accessibilityLabel="How points work">
        <Ionicons name="help-circle-outline" size={22} color={color} />
      </Pressable>
      <PointsInfoModal visible={open} onClose={() => setOpen(false)} scope={scope} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="h3" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="body" color="secondary" style={styles.rowLabel}>{label}</Text>
      <View style={styles.badge}>
        <Text variant="bodyBold" color="brand">{value}</Text>
      </View>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="small" color="muted" style={styles.note}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.surface.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    maxHeight: '85%',
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rowLabel: {
    flex: 1,
    paddingRight: spacing.md,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.brand.primaryLight,
    minWidth: 48,
    alignItems: 'center',
  },
  note: {
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
});
