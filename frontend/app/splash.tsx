import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { getSessionToken } from '../src/lib/auth';
import { RepRoundsLockup } from '../src/components/RepRoundsLockup';

export default function SplashScreen() {
  const router = useRouter();
  const resolved = useRef<'/(app)' | '/(auth)/sign-in' | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    getSessionToken()
      .then((token) => {
        resolved.current = token ? '/(app)' : '/(auth)/sign-in';
      })
      // SecureStore rejects on a keychain error. Without this the ref stayed
      // null forever and the poll below span for the life of the process —
      // a permanently stuck splash screen.
      .catch(() => {
        resolved.current = '/(auth)/sign-in';
      });
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  function onAnimationFinish() {
    // Bound the poll: ~3s of 50ms ticks, then go to sign-in regardless. The
    // auth guard sends them straight back into the app if the token turns out
    // to be fine, which is a far better failure mode than never navigating.
    let attempts = 0;
    const navigate = () => {
      if (resolved.current) {
        router.replace(resolved.current);
        return;
      }
      if (++attempts > 60) {
        router.replace('/(auth)/sign-in');
        return;
      }
      timers.current.push(setTimeout(navigate, 50));
    };
    timers.current.push(setTimeout(navigate, 400));
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0B0D', alignItems: 'center', justifyContent: 'center' }}>
      <MotiView
        from={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 800 }}
        onDidAnimate={(key, finished) => {
          if (key === 'opacity' && finished) {
            onAnimationFinish();
          }
        }}
      >
        <RepRoundsLockup size="lg" onDark={true} />
      </MotiView>
    </View>
  );
}
