import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ROUTINE_TEMPLATES, type RoutineTemplate } from '@app/shared';
import { useCreateFromTemplate } from '../hooks/useRoutines';
import { F, R, D, ThemeColors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { withAlpha } from '../lib/color';

const GOAL_LABEL: Record<RoutineTemplate['goal'], string> = {
  gym: 'Gym',
  martial_arts: 'Martial arts',
  both: 'Gym + Mat',
};

/**
 * Browse + clone a starter routine template. Reused by the Routines screen and
 * the onboarding flow. `goalFilter` narrows the list (e.g. onboarding by goal).
 */
export function TemplateBrowseModal({ visible, onClose, goalFilter, onCreated }: {
  visible: boolean;
  onClose: () => void;
  goalFilter?: RoutineTemplate['goal'];
  onCreated?: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);
  const createFromTemplate = useCreateFromTemplate();

  const templates = useMemo(
    () =>
      goalFilter
        ? ROUTINE_TEMPLATES.filter((t) => t.goal === goalFilter || t.goal === 'both')
        : ROUTINE_TEMPLATES,
    [goalFilter],
  );

  function handlePick(template: RoutineTemplate) {
    createFromTemplate.mutate(
      { templateId: template.id },
      {
        onSuccess: (res) => {
          const created = res.routines.length;
          const skipped = res.skipped.length;
          const msg =
            `Added ${created} routine${created !== 1 ? 's' : ''}` +
            (skipped > 0 ? `. ${skipped} exercise${skipped !== 1 ? 's' : ''} couldn't be matched and were skipped.` : '.');
          Alert.alert(template.name, msg);
          onCreated?.();
          onClose();
        },
        onError: (err) => Alert.alert('Error', err.message || 'Failed to create routines.'),
      },
    );
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.header}>
          <Text style={styles.title}>Start from a template</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {createFromTemplate.isPending ? (
          <View style={styles.centered}><ActivityIndicator color={T.primary} /></View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {templates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={styles.card}
                onPress={() => handlePick(template)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHead}>
                  <Text style={styles.cardName}>{template.name}</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{GOAL_LABEL[template.goal]}</Text>
                  </View>
                </View>
                <Text style={styles.cardDesc}>{template.description}</Text>
                <View style={styles.cardFoot}>
                  <Ionicons name="calendar-outline" size={13} color={T.muted} />
                  <Text style={styles.cardMeta}>
                    {template.daysPerWeek}×/week · {template.routines.length} routine{template.routines.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    modal: { flex: 1, backgroundColor: T.bg, paddingTop: 24 },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 24, marginBottom: 16,
    },
    title: { fontFamily: F.uiBold, fontSize: 20, color: T.text },
    cancel: { fontFamily: F.uiMed, fontSize: 16, color: T.textDim },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    body: { paddingHorizontal: D.pad, paddingBottom: 40, gap: D.stack },
    card: {
      backgroundColor: T.surface, borderWidth: 1, borderColor: T.border,
      borderRadius: R.card, padding: D.cardPad,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardName: { fontFamily: F.uiSemi, fontSize: 16, color: T.text, flex: 1 },
    badge: {
      paddingHorizontal: 10, paddingVertical: 3, borderRadius: R.chip,
      backgroundColor: withAlpha(T.primary, 0.13),
    },
    badgeText: { fontFamily: F.uiSemi, fontSize: 11, color: T.primary },
    cardDesc: { fontFamily: F.uiMed, fontSize: 13, color: T.textDim, marginTop: 6, lineHeight: 18 },
    cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
    cardMeta: { fontFamily: F.uiMed, fontSize: 12, color: T.muted },
  });
}
