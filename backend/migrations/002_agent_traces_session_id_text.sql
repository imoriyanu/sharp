-- Sharp AI — Fix-up for 001_agent_traces.sql.
-- The first migration declared session_id as uuid, but public.sessions.id is
-- text. This alters the column to match so traces can carry the real session
-- ID once we start passing it.

alter table agent_traces alter column session_id type text using session_id::text;
