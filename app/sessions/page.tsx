"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from 'uuid';

import { Button } from "@/components/ui/button";
import { useRecorderMachine } from "@/hooks/useRecorderMachine";
import { RecordingSource } from "@/types/session";

const SOURCE_LABELS: Record<RecordingSource, string> = {
  MIC: "Microphone",
  TAB: "Browser tab"
};

const STATUS_COLORS: Record<string, string> = {
  IDLE: "bg-white/10 text-white",
  RECORDING: "bg-green-500/20 text-green-300",
  PAUSED: "bg-yellow-500/20 text-yellow-200",
  PROCESSING: "bg-blue-500/20 text-blue-200",
  COMPLETED: "bg-emerald-500/20 text-emerald-200",
  FAILED: "bg-red-500/20 text-red-200"
};

type SessionHistory = {
  id: string;
  status: string;
  source: string;
  startedAt: string;
  endedAt?: string;
  summary?: {
    keyPoints: string;
    actionItems: string;
    decisions: string;
  };
  transcript?: Array<{
    text: string;
    sequence: number;
  }>;
};

export default function SessionsPage() {
  const [history, setHistory] = useState<SessionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  const recorder = useRecorderMachine({
    // TODO: wire Better Auth user context
    user: { id: "demo-user", email: "demo@scribe.ai" }
  });
  
  const {
    status,
    source,
    sessionId,
    transcript = [],
    summary,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    setSource
  } = recorder;
  
  // Derive state booleans from status
  const isRecording = status === 'RECORDING';
  const isPaused = status === 'PAUSED';
  const isProcessing = status === 'PROCESSING';

  useEffect(() => {
    // Fetch session history
    const fetchHistory = async () => {
      try {
        const response = await fetch("/api/sessions?userId=demo-user");
        const data = await response.json();
        if (data.sessions) {
          setHistory(data.sessions);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to fetch sessions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [status]); // Refetch when status changes

  const controls = useMemo(() => {
    const handleStart = async () => {
      // The session ID will be generated and handled by the useRecorderMachine hook
      startRecording(source as RecordingSource);
    };

    switch (status) {
      case "RECORDING":
        return (
          <>
            <Button onClick={pauseRecording} variant="ghost">
              Pause
            </Button>
            <Button onClick={stopRecording} variant="danger">
              Stop
            </Button>
          </>
        );
      case "PAUSED":
        return (
          <>
            <Button onClick={resumeRecording}>Resume</Button>
            <Button onClick={stopRecording} variant="danger">
              Stop
            </Button>
          </>
        );
      case "PROCESSING":
        return (
          <Button disabled variant="ghost">
            Processing…
          </Button>
        );
      case "COMPLETED":
      case "FAILED":
        return (
          <>
            <Button 
              onClick={handleStart}
            >
              Start New
            </Button>
          </>
        );
      case "IDLE":
      default:
        return (
          <Button 
            onClick={handleStart}
          >
            Start Recording
          </Button>
        );
    }
  }, [
    pauseRecording,
    resumeRecording,
    source,
    startRecording,
    status,
    stopRecording
  ]);

  const formatDuration = (startedAt: string, endedAt?: string) => {
    if (!endedAt) return "In progress";
    const start = new Date(startedAt);
    const end = new Date(endedAt);
    const minutes = Math.floor((end.getTime() - start.getTime()) / 60000);
    return `${minutes}m`;
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-[400px,1fr]">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/20">
        <header className="mb-6 space-y-2">
          <p className="text-sm uppercase tracking-wide text-white/60">Status</p>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold ${STATUS_COLORS[status]}`}
          >
            <span className="size-2 rounded-full bg-current" />
            {status}
          </div>
        </header>

        <div className="mb-8 space-y-3">
          <p className="text-sm text-white/70">Input source</p>
          <div className="flex gap-2">
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setSource(value as RecordingSource)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  source === value
                    ? "border-brand bg-brand/20 text-white"
                    : "border-white/10 text-white/70 hover:border-white/30"
                }`}
                disabled={status !== "IDLE"}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">{controls}</div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        {summary ? (
          <div className="mt-6 space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="text-xs uppercase tracking-wide text-emerald-200">
              AI Summary
            </p>
            <p>{summary.keyPoints}</p>
            <p className="text-emerald-200">{summary.actionItems}</p>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col rounded-2xl border border-white/5 bg-slate-950/60 p-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/60">Live transcript</p>
            <p className="text-2xl font-semibold text-white">
              Session {sessionId?.slice(0, 8) ?? "—"}
            </p>
          </div>
          <span className="text-sm text-white/60">
            {transcript?.length || 0} chunks
          </span>
        </header>

        <div className="mt-6 flex-1 space-y-4 overflow-y-auto rounded-xl bg-black/30 p-4">
          {transcript.length === 0 ? (
            <p className="text-sm text-white/50">
              Transcript will appear here once Gemini responses stream in.
            </p>
          ) : (
            transcript.map((chunk) => (
              <article
                key={chunk.sequence}
                className="rounded-lg border border-white/5 bg-white/5 p-3"
              >
                <header className="mb-2 flex items-center justify-between text-xs text-white/60">
                  <span className="font-semibold text-white">{chunk.speakerTag}</span>
                  <span>#{chunk.sequence}</span>
                </header>
                <p className="text-sm leading-relaxed text-white/90">{chunk.text}</p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-6xl rounded-2xl border border-white/5 bg-black/40 p-6 md:col-span-2">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/60">History</p>
            <h2 className="text-2xl font-semibold text-white">Recent sessions</h2>
          </div>
          <Button variant="ghost">View all sessions</Button>
        </header>

        {loading ? (
          <p className="text-sm text-white/50">Loading sessions...</p>
        ) : (
          <div className="space-y-4">
            {history.length === 0 ? (
              <p className="text-sm text-white/50">No sessions yet. Start recording to create one!</p>
            ) : (
              history.map((session) => (
                <div
                  key={session.id}
                  className="rounded-xl border border-white/5 bg-white/5 p-4 text-white/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-white">
                        Session {session.id.slice(0, 8)}
                      </p>
                      {session.summary ? (
                        <p className="text-sm text-white/60">
                          {session.summary.keyPoints.slice(0, 100)}...
                        </p>
                      ) : (
                        <p className="text-sm text-white/60">
                          {session.transcript?.[0]?.text.slice(0, 100) || "No transcript yet"}...
                        </p>
                      )}
                    </div>
                    <div className="text-right text-sm text-white/60">
                      <p>{formatDuration(session.startedAt, session.endedAt)}</p>
                      <p className={`${STATUS_COLORS[session.status]}`}>
                        {session.status}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
}
