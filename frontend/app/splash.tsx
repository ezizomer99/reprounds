import { useRouter } from 'expo-router';
import { MotiView } from 'moti';
import { useEffect, useRef } from 'react';
import { Text, View } from 'react-native';
import { getSessionToken } from '../src/lib/auth';

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
    <View style={{ flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center' }}>
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
        <Text
          style={{
            fontFamily: 'BricolageGrotesque_800ExtraBold',
            fontSize: 56,
            color: '#ffffff',
            letterSpacing: -1,
          }}
        >
          glíma
        </Text>
      </MotiView>
    </View>
  );
}
