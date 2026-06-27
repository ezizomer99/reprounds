import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { RepRoundsLockup } from './RepRoundsLockup';
import { D } from '../theme/colors';

export function BrandedHeader() {
  const { T, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        backgroundColor: T.bg,
        paddingTop: insets.top + 6,
        paddingBottom: 10,
        paddingHorizontal: D.pad,
        borderBottomWidth: 1,
        borderBottomColor: T.border,
      }}
    >
      <RepRoundsLockup size="sm" onDark={isDark} />
    </View>
  );
}
