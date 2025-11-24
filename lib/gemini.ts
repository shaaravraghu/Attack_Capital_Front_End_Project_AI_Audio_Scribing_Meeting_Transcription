import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn("GEMINI_API_KEY not found. Streaming will fail until provided.");
}

const client = apiKey ? new GoogleGenerativeAI(apiKey) : null;

const transcriptModel = client?.getGenerativeModel({
  model: "models/gemini-1.5-pro-latest",
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 4096
  }
});

const summaryModel = client?.getGenerativeModel({
  model: "models/gemini-1.5-pro-latest",
  generationConfig: {
    temperature: 0.4,
    responseMimeType: "application/json"
  }
});

export type GeminiSummary = {
  keyPoints: string;
  actionItems: string;
  decisions: string;
};

export async function summarizeTranscript(transcript: string): Promise<GeminiSummary> {
  if (!summaryModel) throw new Error("Gemini API key not configured");

  const prompt = `Please analyze the following meeting transcript and provide a structured summary with the following sections:
  - Key points discussed
  - Action items with owners (if any)
  - Decisions made

Format the response as a JSON object with these exact keys:
{
  "keyPoints": "...",
  "actionItems": "...",
  "decisions": "..."
}

Transcript:
${transcript}`;

  const result = await summaryModel.generateContent(prompt);
  const text = result.response.text();
  
  try {
    // Try to parse the response as JSON
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}') + 1;
    const jsonStr = text.slice(startIdx, endIdx);
    return JSON.parse(jsonStr) as GeminiSummary;
  } catch (e) {
    // If JSON parsing fails, return a fallback object with the raw text
    return {
      keyPoints: text,
      actionItems: "Could not extract action items",
      decisions: "Could not extract decisions"
    };
  }
}

export function getTranscriptModel(): GenerativeModel {
  if (!transcriptModel) {
    throw new Error("Gemini client not configured");
  }
  return transcriptModel;
}

/**
 * Transcribes audio from base64-encoded audio data.
 * Supports WebM/Opus format from MediaRecorder.
 *
 * @param audioBase64 - Base64-encoded audio data (WebM/Opus format)
 * @param mimeType - MIME type of the audio (default: "audio/webm")
 * @returns Transcribed text with speaker diarization hints
 */
export async function transcribeAudio(
  audioBase64: string,
  mimeType: string = "audio/webm"
): Promise<{ text: string; speakerTag: string; confidence?: number }> {
  if (!transcriptModel) {
    throw new Error("Gemini client not configured");
  }

  try {
    // Convert base64 to buffer for Gemini
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // Use Gemini's audio transcription capability
    // Note: Gemini 1.5 Pro supports audio input via file upload
    const prompt = `
Transcribe this audio segment from a meeting. 
Identify speakers if possible and provide accurate transcription.
Handle accents, background noise, and multiple speakers gracefully.
Return the transcription text only, with speaker labels if distinguishable.
Format: "[Speaker 1]: text" or just "text" if single speaker.
`;

    // For audio transcription, we need to use the file API or convert to text
    // Since Gemini API v1 doesn't directly support audio in generateContent,
    // we'll use a workaround: convert audio to text description or use a different approach
    // For production, consider using Google Cloud Speech-to-Text API or Gemini's audio models
    
    // Alternative: Use Gemini's file upload API if available
    // For now, we'll simulate transcription with a text-based approach
    // In production, integrate with Google Cloud Speech-to-Text or wait for Gemini audio API
    
    // Gemini 1.5 Pro supports multimodal input including audio
    // Use inlineData for base64-encoded audio
    const response = await transcriptModel.generateContent([
      prompt,
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType || "audio/webm"
        }
      }
    ]);

    const text = response.response?.text() ?? "";
    
    // Extract speaker tag from transcription if present
    const speakerMatch = text.match(/^\[([^\]]+)\]:\s*(.+)$/);
    if (speakerMatch) {
      return {
        text: speakerMatch[2].trim(),
        speakerTag: speakerMatch[1].trim(),
        confidence: 0.85 // Default confidence
      };
    }

    return {
      text: text.trim(),
      speakerTag: "speaker",
      confidence: 0.8
    };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Transcription error:", error);
    // Fallback: return empty transcription on error
    return {
      text: "",
      speakerTag: "speaker",
      confidence: 0
    };
  }
}


