import { useMemo, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DURATION_SECONDS_RANGE } from '@app/shared';
import { useTheme } from '../theme/ThemeContext';
import { Touchable } from './ui';
import { F, ThemeColors } from '../theme/colors';
import { fmtHMS, parseHMS, splitHMS } from '../units/units';

const ITEM_HEIGHT = 44;
const VISIBLE = 5; // odd — the centre row, under the highlight band, is the selection
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE / 2);

/**
 * One spinning column of a wheel picker. A snap-scrolling ScrollView whose
 * centre slot (fixed highlight band drawn by the parent) is the selected value.
 * No third-party wheel library — the app has been burned by RN UI libs no-op'ing
 * in release builds, so this is built on the ScrollView we already ship.
 */
function WheelColumn({
  count,
  value,
  onChange,
  styles,
}: {
  count: number;
  value: number;
  onChange: (v: number) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const ref = useRef<ScrollView>(null);
  const lastIndex = useRef(value);
  const items = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  const settle = (y: number) => {
    const idx = Math.max(0, Math.min(count - 1, Math.round(y / ITEM_HEIGHT)));
    // Snap exactly onto the slot even when the fling stopped a few px off.
    ref.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    if (idx !== lastIndex.current) {
      lastIndex.current = idx;
      void Haptics.selectionAsync();
      onChange(idx);
    }
  };

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    settle(e.nativeEvent.contentOffset.y);

  return (
    <ScrollView
      ref={ref}
      style={styles.column}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      nestedScrollEnabled
      onMomentumScrollEnd={onEnd}
      // A slow drag can settle without firing momentum — read it here too.
      onScrollEndDrag={onEnd}
      contentContainerStyle={{ paddingVertical: PAD }}
      // Android ignores the iOS contentOffset prop, so seed via the ref on layout.
      onLayout={() => ref.current?.scrollTo({ y: value * ITEM_HEIGHT, animated: false })}
    >
      {items.map((n) => (
        <View key={n} style={styles.item}>
          <Text style={styles.itemText}>{n.toString().padStart(2, '0')}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * Bottom sheet for entering a conditioning set's duration: three spinning
 * Hours : Minutes : Seconds columns, with a keyboard toggle to type instead.
 * Opens in a Modal (never inline) — the duration cell lives in a
 * DraggableFlatList cell, where animating height crashes the drag.
 */
export function DurationWheelSheet({
  current,
  onSelect,
  onClose,
}: {
  current: number | null;
  onSelect: (secs: number) => void;
  onClose: () => void;
}) {
  const { T } = useTheme();
  const styles = useMemo(() => makeStyles(T), [T]);

  const initial = splitHMS(current ?? 0);
  const [h, setH] = useState(initial.h);
  const [m, setM] = useState(initial.m);
  const [s, setS] = useState(initial.s);
  const [mode, setMode] = useState<'wheel' | 'keyboard'>('wheel');
  const [text, setText] = useState(fmtHMS(current ?? 0));

  const keyboardParsed = mode === 'keyboard' ? parseHMS(text) : null;
  const keyboardValid = keyboardParsed !== null;

  function toKeyboard() {
    setText(fmtHMS(h * 3600 + m * 60 + s));
    setMode('keyboard');
  }
  function toWheel() {
    const parsed = parseHMS(text);
    if (parsed !== null) {
      const p = splitHMS(parsed);
      setH(p.h);
      setM(p.m);
      setS(p.s);
    }
    setMode('wheel');
  }

  function commit() {
    const total = mode === 'keyboard' ? (keyboardParsed ?? 0) : h * 3600 + m * 60 + s;
    const clamped = Math.max(
      DURATION_SECONDS_RANGE.min,
      Math.min(DURATION_SECONDS_RANGE.max, total),
    );
    onSelect(clamped);
    onClose();
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Duration</Text>
          <View style={styles.headActions}>
            <Touchable
              onPress={mode === 'wheel' ? toKeyboard : toWheel}
              feedback="row"
              testID="duration-input-mode-toggle"
              accessibilityLabel={mode === 'wheel' ? 'Type the duration instead' : 'Use the wheel picker instead'}
            >
              <Ionicons
                name={mode === 'wheel' ? 'keypad-outline' : 'time-outline'}
                size={22}
                color={T.text}
              />
            </Touchable>
            <Touchable
              onPress={commit}
              disabled={mode === 'keyboard' && !keyboardValid}
              hasTextChild
            >
              <Text style={[styles.done, mode === 'keyboard' && !keyboardValid && { opacity: 0.4 }]}>
                Done
              </Text>
            </Touchable>
          </View>
        </View>

        {mode === 'wheel' ? (
          <View style={styles.body}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Hours</Text>
              <Text style={styles.label}>Minutes</Text>
              <Text style={styles.label}>Seconds</Text>
            </View>
            <View style={styles.wheelArea}>
              <View style={styles.highlightBand} pointerEvents="none" />
              <View style={styles.wheelRow}>
                <WheelColumn count={24} value={h} onChange={setH} styles={styles} />
                <Text style={styles.sep}>:</Text>
                <WheelColumn count={60} value={m} onChange={setM} styles={styles} />
                <Text style={styles.sep}>:</Text>
                <WheelColumn count={60} value={s} onChange={setS} styles={styles} />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.body}>
            <Text style={styles.label}>Enter as h:mm:ss or m:ss</Text>
            <TextInput
              style={[styles.textInput, !keyboardValid && text.trim() !== '' && styles.textInvalid]}
              value={text}
              onChangeText={setText}
              placeholder="0:00"
              placeholderTextColor={T.muted}
              keyboardType="numbers-and-punctuation"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { if (keyboardValid) commit(); }}
              accessibilityLabel="Duration input"
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    sheet: { flex: 1, backgroundColor: T.bg, padding: 20, gap: 18 },
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headActions: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    title: { fontFamily: F.uiBold, fontSize: 18, color: T.text },
    done: { fontFamily: F.uiSemi, fontSize: 16, color: T.primary },
    body: { gap: 12 },
    labelRow: { flexDirection: 'row', justifyContent: 'space-around' },
    label: { fontFamily: F.uiSemi, fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: 'center', flex: 1 },
    wheelArea: { height: ITEM_HEIGHT * VISIBLE, justifyContent: 'center' },
    highlightBand: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: PAD,
      height: ITEM_HEIGHT,
      backgroundColor: T.surface2,
      borderRadius: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: T.borderStrong,
    },
    wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: ITEM_HEIGHT * VISIBLE },
    column: { width: 70, height: ITEM_HEIGHT * VISIBLE },
    item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
    itemText: { fontFamily: F.mono, fontSize: 24, color: T.text },
    sep: { fontFamily: F.mono, fontSize: 24, color: T.muted, marginHorizontal: 2 },
    textInput: {
      borderWidth: 1,
      borderColor: T.border,
      borderRadius: 12,
      backgroundColor: T.surface,
      color: T.text,
      fontFamily: F.mono,
      fontSize: 28,
      textAlign: 'center',
      paddingVertical: 16,
    },
    textInvalid: { borderColor: T.danger },
  });
}
