import { Ionicons } from '@expo/vector-icons';
import { Touchable } from '../ui';

/**
 * The padlock that sits opposite a Pro section's title and opens the paywall.
 *
 * Small, but it was hand-rolled at five call sites across the two stats views,
 * each restating the hit slop, the a11y label and the press feedback — and one
 * of them had no label at all, which is an unlabelled icon-only button to a
 * screen reader.
 */
export function ProLock({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <Touchable
      onPress={onPress}
      feedback="row"
      haptic={false}
      hitSlop={8}
      accessibilityLabel="This section is a Pro feature — upgrade to unlock"
    >
      <Ionicons name="lock-closed" size={16} color={color} />
    </Touchable>
  );
}
