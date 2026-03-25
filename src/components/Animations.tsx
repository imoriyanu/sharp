import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { colors, wp, fp } from '../constants/theme';

// ===== Pulse Dot — breathing dot for recording =====

export function PulseDot({ color = colors.recording, size = wp(10) }: { color?: string; size?: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, transform: [{ scale }], opacity }} />
  );
}

// ===== Audio Wave Bars — animated bars for recording/playback =====

export function AudioWaveBars({ active = true, barCount = 24, color = colors.accent.primary, height = wp(48) }: {
  active?: boolean; barCount?: number; color?: string; height?: number;
}) {
  const anims = useRef(Array.from({ length: barCount }, () => new Animated.Value(0.15))).current;

  useEffect(() => {
    if (!active) {
      anims.forEach(a => a.setValue(0.15));
      return;
    }
    const animations = anims.map((anim, i) => {
      const delay = i * 40 + Math.random() * 60;
      return Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 0.3 + Math.random() * 0.7, duration: 300 + Math.random() * 400, delay, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.1 + Math.random() * 0.2, duration: 300 + Math.random() * 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
    });
    const composed = Animated.parallel(animations);
    composed.start();
    return () => composed.stop();
  }, [active]);

  return (
    <View style={[waveStyles.container, { height }]}>
      {anims.map((anim, i) => (
        <Animated.View key={i} style={[waveStyles.bar, {
          backgroundColor: color,
          height,
          transform: [{ scaleY: anim }],
        }]} />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: wp(2), justifyContent: 'center' },
  bar: { width: wp(3), borderRadius: wp(2) },
});

// ===== Skeleton Loader — shimmer effect for loading states =====

export function SkeletonLoader({ width = '100%', height = wp(16), radius: r = wp(8), style }: {
  width?: number | string; height?: number; radius?: number; style?: any;
}) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(shimmer, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.3, 0.7, 0.3] });

  return (
    <Animated.View style={[{ width: width as any, height, borderRadius: r, backgroundColor: colors.borderLight, opacity }, style]} />
  );
}

// ===== Loading Fox — lazy import to avoid circular dep =====
function LoadingFox({ bounce }: { bounce: Animated.Value }) {
  // Use lazy require inside render to avoid circular import with Illustrations
  const [Fox, setFox] = useState<any>(null);
  useEffect(() => {
    const mod = require('./Illustrations');
    setFox(() => mod.SharpFox);
  }, []);
  if (!Fox) return null;
  return <Fox size={wp(110)} expression="thinking" />;
}

// ===== Loading Screen — Fox with notepad =====

export function LoadingScreen({ message = 'Loading...', submessage }: { message?: string; submessage?: string }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const pencilMove = useRef(new Animated.Value(0)).current;
  const foxBounce = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(dot, { toValue: -wp(6), duration: 250, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(dot, { toValue: 0, duration: 250, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.delay(500),
      ]));
    const b1 = bounce(dot1, 0); const b2 = bounce(dot2, 120); const b3 = bounce(dot3, 240);
    b1.start(); b2.start(); b3.start();

    Animated.loop(Animated.sequence([
      Animated.timing(pencilMove, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pencilMove, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(foxBounce, { toValue: -wp(4), duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(foxBounce, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    return () => { b1.stop(); b2.stop(); b3.stop(); };
  }, []);

  const pencilX = pencilMove.interpolate({ inputRange: [0, 1], outputRange: [-wp(8), wp(8)] });

  return (
    <View style={loadStyles.container}>
      <Animated.View style={[loadStyles.foxSection, { opacity: fadeIn }]}>
        {/* Render the actual SharpFox from Illustrations — passed as children to avoid circular import */}
        <LoadingFox bounce={foxBounce} />

        {/* Notepad */}
        <View style={loadStyles.notepad}>
          <View style={loadStyles.notepadPage}>
            <View style={loadStyles.notepadLine} />
            <View style={[loadStyles.notepadLine, { width: '70%' as any }]} />
            <View style={[loadStyles.notepadLine, { width: '85%' as any }]} />
            <View style={[loadStyles.notepadLine, { width: '50%' as any }]} />
          </View>
          <Animated.Text style={[loadStyles.pencil, { transform: [{ translateX: pencilX }] }]}>✏️</Animated.Text>
        </View>
      </Animated.View>

      <Animated.View style={[loadStyles.textWrap, { opacity: fadeIn }]}>
        <View style={loadStyles.dotsRow}>
          {[dot1, dot2, dot3].map((dot, i) => (
            <Animated.View key={i} style={[loadStyles.dot, { transform: [{ translateY: dot }] }]} />
          ))}
        </View>
        <Text style={loadStyles.message}>{message}</Text>
        {submessage ? <Text style={loadStyles.sub}>{submessage}</Text> : null}
      </Animated.View>
    </View>
  );
}

const loadStyles = StyleSheet.create({
  container: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.primary, zIndex: 100 },
  foxSection: { flexDirection: 'row', alignItems: 'flex-end', gap: wp(10), marginBottom: wp(32) },
  notepad: { alignItems: 'center', marginBottom: wp(10) },
  notepadPage: { backgroundColor: '#FFFFFF', borderRadius: wp(10), padding: wp(12), paddingVertical: wp(14), width: wp(56), gap: wp(6), shadowColor: 'rgba(80,60,40,0.1)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: colors.borderLight },
  notepadLine: { height: wp(3), backgroundColor: colors.borderLight, borderRadius: wp(1.5), width: '100%' },
  pencil: { fontSize: fp(16), marginTop: wp(6) },
  textWrap: { alignItems: 'center' },
  dotsRow: { flexDirection: 'row', gap: wp(8), marginBottom: wp(16) },
  dot: { width: wp(8), height: wp(8), borderRadius: wp(4), backgroundColor: colors.accent.primary },
  message: { fontSize: fp(15), fontWeight: '700', color: colors.text.primary, textAlign: 'center' },
  sub: { fontSize: fp(11), color: colors.text.tertiary, marginTop: wp(6), textAlign: 'center' },
});

// ===== Fade In View — generic fade-in wrapper =====

export function FadeIn({ delay = 0, duration = 400, children, style }: {
  delay?: number; duration?: number; children: React.ReactNode; style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(wp(12))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ===== Score Reveal — animated score counter =====

export function ScoreReveal({ score, color, size = fp(36) }: { score: number; color: string; size?: number }) {
  const animVal = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(animVal, { toValue: score, duration: 800, delay: 200, easing: Easing.out(Easing.ease), useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 40, delay: 100, useNativeDriver: true }),
    ]).start();
  }, [score]);

  const display = animVal.interpolate({ inputRange: [0, 10], outputRange: ['0.0', '10.0'] });

  return (
    <Animated.Text style={{ fontSize: size, fontWeight: '900', color, letterSpacing: -1.5, transform: [{ scale }] }}>
      {score.toFixed(1)}
    </Animated.Text>
  );
}
