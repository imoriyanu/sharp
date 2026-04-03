import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { colors, typography, spacing, radius, wp, fp, shadows, layout } from '../../src/constants/theme';
import { apiPost } from '../../src/services/api';
import { addDocument, generateId } from '../../src/services/storage';
import type { UploadedDocument, DocumentExtraction } from '../../src/types';

export default function DocumentsScreen() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');

  async function pickAndUpload() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size && file.size > maxSize) {
        Alert.alert('File too large', 'Please choose a file under 10MB.');
        return;
      }

      setUploading(true);
      setStatus('Reading file...');

      // Read file as base64
      const base64 = await readAsStringAsync(file.uri, { encoding: EncodingType.Base64 });

      // Extract text via backend
      setStatus('Extracting text...');
      const { rawText } = await apiPost<{ rawText: string }>('/document/extract-text', {
        fileBase64: base64,
        filename: file.name,
      });

      // Parse with Claude
      setStatus('Analysing document...');
      const extraction = await apiPost<DocumentExtraction>('/document/parse', { rawText });

      // Build the document object
      const doc: UploadedDocument = {
        id: generateId(),
        filename: file.name,
        rawText,
        structuredExtraction: extraction,
        summary: extraction.summary,
        documentType: extraction.documentType,
        documentSubtype: extraction.documentSubtype,
        uploadedAt: new Date().toISOString(),
      };

      // Save locally + sync to Supabase
      setStatus('Saving...');
      await addDocument(doc, file.uri);

      setUploading(false);
      setStatus('');
      Alert.alert(
        'Document added',
        `${file.name} classified as ${extraction.documentType} (${extraction.documentSubtype}).\n\nSharp will now use this to personalise your questions and coaching.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e: any) {
      __DEV__ && console.error('Document upload error:', e);
      setUploading(false);
      setStatus('');
      const msg = e?.message || 'Something went wrong';
      Alert.alert('Upload failed', msg.includes('Unsupported') || msg.includes('extract') ? msg : 'Could not process this document. Please try a different file.');
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.container}>
        <View style={s.header}>
          <Text style={s.title}>Add Document</Text>
          <TouchableOpacity onPress={() => !uploading && router.back()}><Text style={s.close}>×</Text></TouchableOpacity>
        </View>

        <Text style={s.desc}>Upload a PDF, DOCX, or text file. Sharp will automatically classify it and extract information to personalise your questions and coaching.</Text>

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

        {uploading ? (
          <View style={s.uploadingArea}>
            <ActivityIndicator size="small" color={colors.accent.primary} />
            <Text style={s.uploadingText}>{status}</Text>
          </View>
        ) : (
          <TouchableOpacity style={s.mainBtn} onPress={pickAndUpload} activeOpacity={0.8}>
            <Text style={s.mainBtnText}>Choose file</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.ghostBtn} onPress={() => !uploading && router.back()} activeOpacity={0.7} disabled={uploading}>
          <Text style={[s.ghostBtnText, uploading && { opacity: 0.4 }]}>Cancel</Text>
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
  uploadingArea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: wp(15), marginBottom: spacing.sm },
  uploadingText: { fontSize: fp(12), fontWeight: typography.weight.semibold, color: colors.accent.primary },
  mainBtn: { backgroundColor: colors.accent.primary, borderRadius: radius.lg, paddingVertical: wp(15), alignItems: 'center', marginBottom: spacing.sm, ...shadows.accent },
  mainBtnText: { fontSize: fp(13), fontWeight: typography.weight.bold, color: colors.text.inverse },
  ghostBtn: { backgroundColor: colors.bg.secondary, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.lg, paddingVertical: wp(13), alignItems: 'center' },
  ghostBtnText: { fontSize: fp(11), fontWeight: typography.weight.semibold, color: colors.text.tertiary },
});
