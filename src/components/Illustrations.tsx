import { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, Easing, StyleSheet } from 'react-native';
import { colors, wp, fp } from '../constants/theme';

// ===== Sharp Fox Mascot — Full body with glasses =====
export function SharpFox({ size = wp(120), expression = 'happy' }: { size?: number; expression?: 'happy' | 'thinking' | 'celebrating' | 'listening' }) {
  const bounce = useRef(new Animated.Value(0)).current;
  const tailWag = useRef(new Animated.Value(0)).current;
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    // Gentle bounce
    Animated.loop(Animated.sequence([
      Animated.timing(bounce, { toValue: -size * 0.03, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    // Tail wag
    Animated.loop(Animated.sequence([
      Animated.timing(tailWag, { toValue: 15, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(tailWag, { toValue: -10, duration: 400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(tailWag, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.delay(expression === 'celebrating' ? 200 : 1500),
    ])).start();

    // Blink
    const blinkInterval = setInterval(() => {
      setBlink(true);
      setTimeout(() => setBlink(false), 150);
    }, 3000 + Math.random() * 2000);

    return () => clearInterval(blinkInterval);
  }, [expression]);

  const s = size;
  const tailRotate = tailWag.interpolate({ inputRange: [-10, 0, 15], outputRange: ['-10deg', '0deg', '15deg'] });

  const isCelebrating = expression === 'celebrating';

  return (
    <Animated.View style={{ width: s, height: s * 0.95, transform: [{ translateY: bounce }] }}>
      {/* === TAIL (behind body) === */}
      <Animated.View style={{
        position: 'absolute', bottom: s * 0.12, right: s * 0.02,
        width: s * 0.4, height: s * 0.16,
        backgroundColor: '#C07050', borderRadius: s * 0.08,
        transform: [{ rotate: tailRotate }, { translateX: s * 0.05 }],
        zIndex: 0,
      }}>
        <View style={{ position: 'absolute', right: 0, top: s * 0.01, bottom: s * 0.01, width: s * 0.13, backgroundColor: '#F5E6D0', borderRadius: s * 0.06 }} />
      </Animated.View>

      {/* === BODY === */}
      <View style={{
        position: 'absolute', bottom: 0, left: s * 0.15, right: s * 0.15,
        height: s * 0.42, backgroundColor: '#C07050',
        borderTopLeftRadius: s * 0.15, borderTopRightRadius: s * 0.15,
        borderBottomLeftRadius: s * 0.1, borderBottomRightRadius: s * 0.1,
        alignItems: 'center', zIndex: 1,
      }}>
        {/* Chest/belly */}
        <View style={{
          width: s * 0.35, height: s * 0.28,
          backgroundColor: '#F5E6D0',
          borderBottomLeftRadius: s * 0.14, borderBottomRightRadius: s * 0.14,
          marginTop: s * 0.04,
        }} />
        {/* Front paws */}
        <View style={{ position: 'absolute', bottom: -s * 0.02, flexDirection: 'row', gap: s * 0.18 }}>
          <View style={{ width: s * 0.1, height: s * 0.06, backgroundColor: '#A05A3A', borderRadius: s * 0.03 }} />
          <View style={{ width: s * 0.1, height: s * 0.06, backgroundColor: '#A05A3A', borderRadius: s * 0.03 }} />
        </View>
      </View>

      {/* === HEAD (overlaps body top) === */}
      <View style={{
        position: 'absolute', top: 0, alignSelf: 'center', left: s * 0.12, right: s * 0.12,
        height: s * 0.55, backgroundColor: '#C07050',
        borderRadius: s * 0.22,
        alignItems: 'center', zIndex: 3,
      }}>
        {/* Left ear */}
        <View style={{ position: 'absolute', top: -s * 0.08, left: s * 0.02 }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.09, borderRightWidth: s * 0.09, borderBottomWidth: s * 0.15, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#C07050' }} />
          <View style={{ position: 'absolute', top: s * 0.04, left: s * 0.035, width: 0, height: 0, borderLeftWidth: s * 0.055, borderRightWidth: s * 0.055, borderBottomWidth: s * 0.09, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#E8A070' }} />
        </View>
        {/* Right ear */}
        <View style={{ position: 'absolute', top: -s * 0.08, right: s * 0.02 }}>
          <View style={{ width: 0, height: 0, borderLeftWidth: s * 0.09, borderRightWidth: s * 0.09, borderBottomWidth: s * 0.15, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#C07050' }} />
          <View style={{ position: 'absolute', top: s * 0.04, left: s * 0.035, width: 0, height: 0, borderLeftWidth: s * 0.055, borderRightWidth: s * 0.055, borderBottomWidth: s * 0.09, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#E8A070' }} />
        </View>

        {/* White face/muzzle area */}
        <View style={{
          position: 'absolute', bottom: 0,
          width: s * 0.42, height: s * 0.28,
          backgroundColor: '#F5E6D0',
          borderTopLeftRadius: s * 0.1, borderTopRightRadius: s * 0.1,
          borderBottomLeftRadius: s * 0.18, borderBottomRightRadius: s * 0.18,
        }} />

        {/* === GLASSES === */}
        <View style={{ position: 'absolute', top: s * 0.14, flexDirection: 'row', alignItems: 'center' }}>
          {/* Left lens */}
          <View style={{
            width: s * 0.16, height: s * 0.12,
            borderRadius: s * 0.04, borderWidth: s * 0.015,
            borderColor: '#3A2A1A', backgroundColor: 'rgba(200,220,240,0.15)',
          }} />
          {/* Bridge */}
          <View style={{ width: s * 0.04, height: s * 0.015, backgroundColor: '#3A2A1A' }} />
          {/* Right lens */}
          <View style={{
            width: s * 0.16, height: s * 0.12,
            borderRadius: s * 0.04, borderWidth: s * 0.015,
            borderColor: '#3A2A1A', backgroundColor: 'rgba(200,220,240,0.15)',
          }} />
        </View>

        {/* Eyes (inside glasses) */}
        <View style={{ position: 'absolute', top: s * 0.17, flexDirection: 'row', gap: s * 0.12 }}>
          {/* Left eye */}
          <View style={{ width: s * 0.055, height: blink ? s * 0.01 : s * 0.055, backgroundColor: '#2A1A0A', borderRadius: s * 0.03 }}>
            {!blink && <View style={{ position: 'absolute', top: s * 0.01, left: s * 0.015, width: s * 0.018, height: s * 0.018, backgroundColor: '#FFF', borderRadius: s * 0.01 }} />}
          </View>
          {/* Right eye */}
          <View style={{ width: s * 0.055, height: (blink || isCelebrating) ? s * 0.01 : s * 0.055, backgroundColor: '#2A1A0A', borderRadius: s * 0.03 }}>
            {!blink && !isCelebrating && <View style={{ position: 'absolute', top: s * 0.01, left: s * 0.015, width: s * 0.018, height: s * 0.018, backgroundColor: '#FFF', borderRadius: s * 0.01 }} />}
          </View>
        </View>

        {/* Nose */}
        <View style={{ position: 'absolute', top: s * 0.3, width: s * 0.06, height: s * 0.04, backgroundColor: '#2A1A0A', borderRadius: s * 0.02 }} />

        {/* Mouth */}
        {(expression === 'happy' || expression === 'celebrating' || expression === 'listening') && (
          <View style={{ position: 'absolute', top: s * 0.36, width: s * 0.1, height: s * 0.04, borderBottomLeftRadius: s * 0.05, borderBottomRightRadius: s * 0.05, borderBottomWidth: s * 0.012, borderLeftWidth: s * 0.008, borderRightWidth: s * 0.008, borderColor: '#3A2A1A', borderTopWidth: 0 }} />
        )}
        {expression === 'thinking' && (
          <View style={{ position: 'absolute', top: s * 0.37, width: s * 0.06, height: s * 0.03, backgroundColor: '#3A2A1A', borderRadius: s * 0.015 }} />
        )}
      </View>

      {/* Celebrating sparkles */}
      {isCelebrating && (
        <>
          <Text style={{ position: 'absolute', top: 0, left: s * 0.05, fontSize: s * 0.08 }}>✨</Text>
          <Text style={{ position: 'absolute', top: s * 0.05, right: s * 0.02, fontSize: s * 0.07 }}>⭐</Text>
        </>
      )}
    </Animated.View>
  );
}

// ===== Speech Bubble =====
export function SpeechBubble({ text, delay = 0, variant = 'default' }: { text: string; delay?: number; variant?: 'default' | 'accent' }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(wp(10))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 500, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [text]);

  const isAccent = variant === 'accent';

  return (
    <Animated.View style={[bub.container, isAccent && bub.containerAccent, { opacity, transform: [{ translateY }] }]}>
      <Text style={[bub.text, isAccent && bub.textAccent]}>{text}</Text>
    </Animated.View>
  );
}

const bub = StyleSheet.create({
  container: { backgroundColor: colors.bg.secondary, borderRadius: wp(20), padding: wp(18), paddingHorizontal: wp(24), maxWidth: wp(300), shadowColor: 'rgba(80,60,40,0.08)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12, elevation: 3 },
  containerAccent: { backgroundColor: colors.accent.light, borderWidth: 1.5, borderColor: colors.accent.border },
  text: { fontSize: fp(14), fontWeight: '600', color: colors.text.primary, lineHeight: fp(22), textAlign: 'center' },
  textAccent: { color: colors.accent.dark },
});

// ===== Progress Dots =====
export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={pd.row}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[pd.dot, i < current && pd.dotDone, i === current && pd.dotActive]} />
      ))}
    </View>
  );
}

const pd = StyleSheet.create({
  row: { flexDirection: 'row', gap: wp(8), justifyContent: 'center', paddingVertical: wp(12) },
  dot: { width: wp(8), height: wp(8), borderRadius: wp(4), backgroundColor: colors.borderLight },
  dotDone: { backgroundColor: colors.accent.primary },
  dotActive: { backgroundColor: colors.accent.primary, width: wp(32), borderRadius: wp(4) },
});

// ===== Confetti Burst =====
export function ConfettiBurst() {
  const particles = useRef(
    Array.from({ length: 20 }, () => ({
      x: new Animated.Value(0), y: new Animated.Value(0),
      opacity: new Animated.Value(1), scale: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    particles.forEach((p, i) => {
      const angle = (i / 20) * Math.PI * 2;
      const dist = wp(40) + Math.random() * wp(60);
      Animated.sequence([
        Animated.delay(i * 30),
        Animated.parallel([
          Animated.spring(p.scale, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
          Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(p.y, { toValue: Math.sin(angle) * dist - wp(30), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: 700, delay: 200, useNativeDriver: true }),
        ]),
      ]).start();
    });
  }, []);

  const confettiColors = ['#C07050', '#5A9A5A', '#8B7EC8', '#E8A838', '#4080C0', '#D4A060'];

  return (
    <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
      {particles.map((p, i) => (
        <Animated.View key={i} style={{
          position: 'absolute',
          width: i % 3 === 0 ? wp(10) : wp(6),
          height: i % 3 === 0 ? wp(5) : wp(6),
          borderRadius: i % 2 === 0 ? wp(3) : 0,
          backgroundColor: confettiColors[i % confettiColors.length],
          transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
          opacity: p.opacity,
        }} />
      ))}
    </View>
  );
}

// ===== Feature Card =====
export function FeatureCard({ emoji, title, desc, chipLabel, chipColor, delay = 0 }: {
  emoji: string; title: string; desc: string; chipLabel: string; chipColor: string; delay?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(wp(30))).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 500, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[fc.card, { opacity, transform: [{ translateX }] }]}>
      <Text style={fc.emoji}>{emoji}</Text>
      <View style={fc.info}>
        <View style={fc.titleRow}>
          <Text style={fc.title}>{title}</Text>
          <View style={[fc.chip, { backgroundColor: chipLabel === 'Free' ? colors.feedback.positiveBg : colors.accent.light }]}>
            <Text style={[fc.chipText, { color: chipColor }]}>{chipLabel}</Text>
          </View>
        </View>
        <Text style={fc.desc}>{desc}</Text>
      </View>
    </Animated.View>
  );
}

const fc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: wp(14), backgroundColor: colors.bg.secondary, borderRadius: wp(18), padding: wp(16), marginBottom: wp(10), shadowColor: 'rgba(80,60,40,0.06)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 },
  emoji: { fontSize: fp(26) },
  info: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: wp(8), marginBottom: wp(3) },
  title: { fontSize: fp(14), fontWeight: '700', color: colors.text.primary },
  chip: { borderRadius: wp(10), paddingHorizontal: wp(8), paddingVertical: wp(2) },
  chipText: { fontSize: fp(9), fontWeight: '700' },
  desc: { fontSize: fp(11), color: colors.text.tertiary, lineHeight: fp(16) },
});

// ===== Stat Bubble =====
export function StatBubble({ emoji, value, label }: { emoji: string; value: string; label: string }) {
  return (
    <View style={stat.container}>
      <Text style={stat.emoji}>{emoji}</Text>
      <Text style={stat.value}>{value}</Text>
      <Text style={stat.label}>{label}</Text>
    </View>
  );
}

const stat = StyleSheet.create({
  container: { backgroundColor: colors.bg.secondary, borderRadius: wp(16), padding: wp(14), alignItems: 'center', width: wp(90), shadowColor: 'rgba(80,60,40,0.06)', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 2 },
  emoji: { fontSize: fp(20), marginBottom: wp(4) },
  value: { fontSize: fp(18), fontWeight: '900', color: colors.text.primary },
  label: { fontSize: fp(9), fontWeight: '600', color: colors.text.tertiary, marginTop: wp(2) },
});
