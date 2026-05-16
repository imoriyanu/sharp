import { supabase } from './supabase';
import type { Session, UserContext, UserProfile, Streak, DailyResult, UploadedDocument } from '../types';

// ===== Helper: get current user ID =====
async function getUserId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

// ===== Profile Sync =====

export async function syncProfileToCloud(profile: UserProfile): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await supabase.from('profiles').upsert({
      id: userId,
      display_name: profile.displayName,
      avatar_url: profile.avatarUri || null,
      is_premium: profile.isPremium,
      updated_at: new Date().toISOString(),
    });
  } catch (e) { __DEV__ && console.warn('Profile sync failed:', e); }
}

// ===== Context Sync =====

export async function syncContextToCloud(ctx: UserContext): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await supabase.from('user_context').upsert({
      user_id: userId,
      role_text: ctx.roleText,
      current_company: ctx.currentCompany,
      situation_text: ctx.situationText,
      dream_role_and_company: ctx.dreamRoleAndCompany,
      updated_at: new Date().toISOString(),
    });
  } catch (e) { __DEV__ && console.warn('Context sync failed:', e); }
}

// ===== Session Sync =====

export async function syncSessionToCloud(session: Session): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    // Upsert session
    await supabase.from('sessions').upsert({
      id: session.id,
      user_id: userId,
      type: session.type,
      scenario: session.scenario,
      created_at: session.createdAt,
    });

    // Upsert all turns
    for (const turn of session.turns) {
      await supabase.from('turns').upsert({
        id: turn.id,
        session_id: session.id,
        user_id: userId,
        turn_number: turn.turnNumber,
        question: turn.question,
        transcript: turn.transcript,
        model_answer: turn.modelAnswer || null,
        scores: turn.scores,
        overall: turn.overall,
        summary: turn.summary,
        positives: turn.positives || null,
        improvements: turn.improvements || null,
        coaching_insight: turn.coachingInsight,
        communication_tip: turn.communicationTip || null,
        snippet: turn.snippet,
        filler_words_found: turn.fillerWordsFound || [],
        filler_count: turn.fillerCount || 0,
        created_at: session.createdAt,
      });
    }
  } catch (e) { __DEV__ && console.warn('Session sync failed:', e); }
}

// ===== Streak Sync =====

export async function syncStreakToCloud(streak: Streak): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await supabase.from('streaks').upsert({
      user_id: userId,
      current_streak: streak.currentStreak,
      longest_streak: streak.longestStreak,
      last_session_date: streak.lastSessionDate,
      freezes_available: streak.freezesAvailable,
      updated_at: new Date().toISOString(),
    });
  } catch (e) { __DEV__ && console.warn('Streak sync failed:', e); }
}

// ===== Badge Sync =====

export async function syncBadgeToCloud(badgeDay: number): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await supabase.from('badges').upsert({
      user_id: userId,
      badge_day: badgeDay,
      unlocked_at: new Date().toISOString(),
    });
  } catch (e) { __DEV__ && console.warn('Badge sync failed:', e); }
}

// ===== Daily Result Sync =====

export async function syncDailyResultToCloud(result: DailyResult): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await supabase.from('daily_results').upsert({
      user_id: userId,
      score: result.score,
      insight: result.insight,
      practice_date: result.date,
      created_at: new Date().toISOString(),
    });
  } catch (e) { __DEV__ && console.warn('Daily result sync failed:', e); }
}

// ===== Document Upload to Supabase Storage =====

export async function uploadDocumentToStorage(fileUri: string, filename: string): Promise<string | null> {
  const userId = await getUserId();
  if (!userId) return null;

  try {
    if (!fileUri) return null;
    const response = await fetch(fileUri);
    if (!response.ok) return null;
    const blob = await response.blob();
    const path = `${userId}/${Date.now()}_${filename}`;

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(path, blob, { contentType: 'application/octet-stream', upsert: true });

    if (error) throw error;
    return data.path;
  } catch (e) {
    __DEV__ && console.warn('Document upload failed:', e);
    return null;
  }
}

export async function getDocumentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

// ===== Document Sync (metadata to DB) =====

export async function syncDocumentToCloud(doc: UploadedDocument, storagePath: string | null): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    await supabase.from('documents').upsert({
      id: doc.id,
      user_id: userId,
      filename: doc.filename,
      raw_text: doc.rawText.substring(0, 10000), // cap for DB storage
      structured_extraction: doc.structuredExtraction,
      summary: doc.summary,
      document_type: doc.documentType,
      document_subtype: doc.documentSubtype,
      storage_path: storagePath,
      uploaded_at: doc.uploadedAt,
    });
  } catch (e) { __DEV__ && console.warn('Document sync failed:', e); }
}

export async function deleteDocumentFromCloud(docId: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  try {
    // Get storage path before deleting record
    const { data } = await supabase.from('documents').select('storage_path').eq('id', docId).single();
    if (data?.storage_path) {
      await supabase.storage.from('documents').remove([data.storage_path]);
    }
    await supabase.from('documents').delete().eq('id', docId);
  } catch (e) { __DEV__ && console.warn('Document delete failed:', e); }
}

// ===== Full Migration (one-time: AsyncStorage → Supabase) =====

export async function migrateLocalToCloud(data: {
  profile: UserProfile | null;
  context: UserContext | null;
  sessions: Session[];
  streak: Streak;
  unlockedBadges: number[];
  dailyResults: DailyResult[];
}): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  __DEV__ && console.log('Starting cloud migration...');

  // Run independent writes in parallel. They don't depend on each other.
  // All upserts are idempotent on primary key so retrying after a crash
  // creates no duplicates.
  const tasks: Promise<unknown>[] = [];

  if (data.profile) tasks.push(syncProfileToCloud(data.profile));
  if (data.context) tasks.push(syncContextToCloud(data.context));
  tasks.push(syncStreakToCloud(data.streak));

  // Badges + daily results in batched upserts (single round-trip each)
  if (data.unlockedBadges.length) {
    tasks.push((async () => {
      try {
        const rows = data.unlockedBadges.map(badge_day => ({
          user_id: userId,
          badge_day,
          unlocked_at: new Date().toISOString(),
        }));
        await supabase.from('badges').upsert(rows);
      } catch (e) { __DEV__ && console.warn('Batch badge upsert failed:', e); }
    })());
  }

  if (data.dailyResults.length) {
    tasks.push((async () => {
      try {
        const rows = data.dailyResults.map(r => ({
          user_id: userId,
          score: r.score,
          insight: r.insight,
          practice_date: r.date,
          created_at: new Date().toISOString(),
        }));
        await supabase.from('daily_results').upsert(rows);
      } catch (e) { __DEV__ && console.warn('Batch daily_results upsert failed:', e); }
    })());
  }

  // Sessions + their turns: batch into two upserts (one per table) rather
  // than 1 + N per session. Idempotent on session.id / turn.id.
  if (data.sessions.length) {
    tasks.push((async () => {
      try {
        const sessionRows = data.sessions.map(s => ({
          id: s.id,
          user_id: userId,
          type: s.type,
          scenario: s.scenario,
          created_at: s.createdAt,
        }));
        const turnRows = data.sessions.flatMap(s => s.turns.map(turn => ({
          id: turn.id,
          session_id: s.id,
          user_id: userId,
          turn_number: turn.turnNumber,
          question: turn.question,
          transcript: turn.transcript,
          model_answer: turn.modelAnswer || null,
          scores: turn.scores,
          overall: turn.overall,
          summary: turn.summary,
          positives: turn.positives || null,
          improvements: turn.improvements || null,
          coaching_insight: turn.coachingInsight,
          communication_tip: turn.communicationTip || null,
          snippet: turn.snippet,
          filler_words_found: turn.fillerWordsFound || [],
          filler_count: turn.fillerCount || 0,
          created_at: s.createdAt,
        })));
        // Sessions first (turns has FK to sessions.id).
        await supabase.from('sessions').upsert(sessionRows);
        if (turnRows.length) await supabase.from('turns').upsert(turnRows);
      } catch (e) { __DEV__ && console.warn('Batch session/turn upsert failed:', e); }
    })());
  }

  // Promise.allSettled. One failure doesn't tank the rest.
  const results = await Promise.allSettled(tasks);
  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    // Throw so the caller (storage.ts:runMigrationIfNeeded) can mark the
    // attempt as failed and retry on next launch.
    throw new Error(`${failed} migration tasks failed`);
  }

  __DEV__ && console.log('Cloud migration complete:', data.sessions.length, 'sessions synced');
}
