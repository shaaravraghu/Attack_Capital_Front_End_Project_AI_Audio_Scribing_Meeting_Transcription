export type SessionStatus =
  | "IDLE"
  | "RECORDING"
  | "PAUSED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type RecordingSource = "MIC" | "TAB";

export type TranscriptUpdate = {
  sessionId: string;
  sequence: number;
  text: string;
  speakerTag: string;
  confidence?: number;
};

export type SessionSummary = {
  keyPoints: string;
  actionItems: string;
  decisions: string;
};


