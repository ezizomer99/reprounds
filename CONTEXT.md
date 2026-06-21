# RepRounds — Terminology Glossary

## Styling & Animation

**NativeWind** — Tailwind-based utility class styling system for React Native. Handles layout, color, spacing, typography. Has no animation primitives.

**Hybrid styling** — Project convention: NativeWind utility classes for static layout and color tokens; `StyleSheet` / `useAnimatedStyle` for dynamic or animated values. Animated components always require `style={}` for Reanimated values — using `className=` alone on animated elements is architecturally impossible.

**Reanimated** (`react-native-reanimated`) — Low-level worklet-based animation engine. Used for gesture-driven animations (e.g. swipe-to-delete). Requires `GestureHandlerRootView` at app root.

**Moti** — Declarative animation wrapper over Reanimated. Used for non-gesture animations: logo entrance, checkmark animate-in, day-strip highlight. Preferred for agent-readable components.

**Splash screen vs. JS loading screen** — The native splash screen (`expo-splash-screen`) is static and OS-rendered — it cannot be animated with Reanimated. The project uses a separate JS-rendered `<SplashAnimation>` screen as the first Expo Router route. Background colors must match the native splash config to avoid a visible flash on handoff.

## Animation Moments (scoped)

| Moment | Library |
|---|---|
| Logo entrance on app load | Moti |
| Set completion feedback (scale flash, checkmark) | Moti |
| Day-strip highlight transition (calendar/routine) | Moti |
| Swipe-to-delete on set row | Reanimated + `react-native-gesture-handler` |
