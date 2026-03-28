import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';

export default function DocumentsScreen() {
  const router = useRouter();

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const file = result.assets[0];
        Alert.alert('Document Selected', `${file.name}\n\nDocument parsing will send this to the backend for classification and extraction.`);
        // TODO: Upload file, parse with Claude, save to context
      }
    } catch (e) {
      __DEV__ && console.error('Document picker error:', e);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Add Document</Text>
          <TouchableOpacity onPress={() => router.back()}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        <Text style={s.desc}>Upload a PDF, DOCX, or text file. Sharp will automatically classify it as Identity (CV), Aspiration (job desc), Evidence (project brief), or Preparation (agenda) and extract the relevant information.</Text>

        <View style={s.types}>
          {[
            { label: 'Identity', desc: 'CV, resume, profile', bg: colors.docType.identity.bg, color: colors.docType.identity.text },
            { label: 'Aspiration', desc: 'Job desc, promo criteria', bg: colors.docType.aspiration.bg, color: colors.docType.aspiration.text },
            { label: 'Evidence', desc: 'Project brief, review', bg: colors.docType.evidence.bg, color: colors.docType.evidence.text },
            { label: 'Preparation', desc: 'Agenda, talking points', bg: colors.docType.preparation.bg, color: colors.docType.preparation.text },
          ].map(t => (
            <View key={t.label} style={[s.typeRow, { backgroundColor: t.bg }]}>
              <Text style={[s.typeLabel, { color: t.color }]}>{t.label}</Text>
              <Text style={[s.typeDesc, { color: t.color }]}>{t.desc}</Text>
            </View>
          ))}
        </View>

        <View style={s.spacer} />

        <TouchableOpacity style={s.mainBtn} onPress={pickDocument} activeOpacity={0.8}>
          <Text style={s.mainBtnText}>📄 Choose file</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={s.ghostBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  container: { flex: 1, padding: layout.screenPadding },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xl },
  title: { fontSize: typography.size.title, fontWeight: typography.weight.black, color: colors.text.primary },
  close: { fontSize: fp(22), color: colors.text.muted },
  desc: { fontSize: fp(11), color: colors.text.secondary, lineHeight: fp(18), marginBottom: spacing.xxl },
  spacer: { flex: 1 },
  types: { gap: spacing.sm },
  typeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.md, padding: spacing.md },
  typeLabel: { fontSize: fp(11), fontWeight: typography.weight.bold },
  typeDesc: { fontSize: fp(10), opacity: 0.7 },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
