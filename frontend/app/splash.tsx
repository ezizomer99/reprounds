import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { getSessionToken } from '../src/lib/auth';
import { RepRoundsLockup } from '../src/components/RepRoundsLockup';

export default function SplashScreen() {
  const router = useRouter();
  const resolved = useRef<'/(app)' | '/(auth)/sign-in' | null>(null);

  useEffect(() => {
    getSessionToken().then((token) => {
      resolved.current = token ? '/(app)' : '/(auth)/sign-in';
    });
  }, []);

  function onAnimationFinish() {
    const navigate = () => {
      if (resolved.current) {
        router.replace(resolved.current);
      } else {
        setTimeout(navigate, 50);
      }
    };
    setTimeout(navigate, 400);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#17140F', alignItems: 'center', justifyContent: 'center' }}>
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
