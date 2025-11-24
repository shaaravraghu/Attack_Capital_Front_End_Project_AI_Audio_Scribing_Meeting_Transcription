"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useMachine } from "@xstate/react";
import { Socket } from "socket.io-client";
import { assign, createMachine } from "xstate";

import { createSocket } from "@/lib/socket-client";
import {
  RecordingSource,
  SessionStatus,
  SessionSummary,
  TranscriptUpdate
} from "@/types/session";

type RecorderContext = {
  sessionId?: string;
  source: RecordingSource;
  transcript: TranscriptUpdate[];
  summary?: SessionSummary;
  error?: string;
};

type RecorderEvent =
  | { type: "START"; sessionId: string; source: RecordingSource }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP" }
  | { type: "RESET" }
  | { type: "TRANSCRIPT"; update: TranscriptUpdate }
  | { type: "SUMMARY"; summary: SessionSummary }
  | { type: "ERROR"; error: string }
  | { type: "SET_SOURCE"; source: RecordingSource };

const defaultContext: RecorderContext = {
  source: "MIC",
  transcript: []
};

const recorderMachine = createMachine({
  id: "recorder",
  context: defaultContext,
  initial: "idle",
  types: {} as {
    context: RecorderContext;
    events: RecorderEvent;
  },
  states: {
    idle: {
      on: {
        SET_SOURCE: {
          actions: assign({
            source: ({ event }) => event.source
          })
        },
        START: {
          target: "recording",
          actions: assign({
            sessionId: ({ event }) => event.sessionId,
            source: ({ event }) => event.source,
            transcript: () => [],
            summary: () => undefined,
            error: () => undefined
          })
        }
      }
    },
    recording: {
      on: {
        TRANSCRIPT: {
          actions: assign({
            transcript: ({ context, event }) => {
              const existingIndex = context.transcript.findIndex(
                (chunk) => chunk.sequence === event.update.sequence
              );
              if (existingIndex >= 0) {
                const next = [...context.transcript];
                next[existingIndex] = event.update;
                return next;
              }
              return [...context.transcript, event.update].sort(
                (a, b) => a.sequence - b.sequence
              );
            }
          })
        },
        PAUSE: { target: "paused" },
        STOP: { target: "processing" },
        ERROR: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error
          })
        }
      }
    },
    paused: {
      on: {
        RESUME: { target: "recording" },
        STOP: { target: "processing" },
        ERROR: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error
          })
        }
      }
    },
    processing: {
      on: {
        SUMMARY: {
          target: "completed",
          actions: assign({
            summary: ({ event }) => event.summary
          })
        },
        ERROR: {
          target: "failed",
          actions: assign({
            error: ({ event }) => event.error
          })
        }
      }
    },
    completed: {
      on: {
        RESET: {
          target: "idle",
          actions: assign(() => defaultContext)
        }
      }
    },
    failed: {
      on: {
        RESET: {
          target: "idle",
          actions: assign(() => defaultContext)
        }
      }
    }
  }
});

type UseRecorderOptions = {
  user: { id: string; email: string };
};

const CHUNK_DURATION_MS = 5000; // Reduced to 5s for faster processing

export function useRecorderMachine({ user }: UseRecorderOptions) {
  const [state, send] = useMachine(recorderMachine);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sequenceRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const currentSessionIdRef = useRef<string | undefined>(undefined);
  
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [browserError, setBrowserError] = useState<string | null>(null);
  
  // Browser compatibility check
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const error = getBrowserCompatibilityError();
      setIsSupported(!error);
      setBrowserError(error);
    }
  }, []);

  const status = useMemo<SessionStatus>(() => {
    switch (state.value) {
      case "recording":
        return "RECORDING";
      case "paused":
        return "PAUSED";
      case "processing":
        return "PROCESSING";
      case "completed":
        return "COMPLETED";
      case "failed":
        return "FAILED";
      default:
        return "IDLE";
    }
  }, [state.value]);

  // Socket connection
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const socket = createSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
    });

    socket.on("transcription:update", (payload: TranscriptUpdate) => {
      console.log("Transcription update received:", payload);
      send({ type: "TRANSCRIPT", update: payload });
    });

    socket.on(
      "session:status",
      (payload: { status: SessionStatus; summary?: SessionSummary }) => {
        console.log("Session status update:", payload);
        if (payload.status === "PROCESSING") {
          send({ type: "STOP" });
        }
        if (payload.status === "COMPLETED" && payload.summary) {
          send({ type: "SUMMARY", summary: payload.summary });
        }
      }
    );

    socket.on("session:error", (payload: { message: string }) => {
      console.error("Session error:", payload.message);
      send({ type: "ERROR", error: payload.message });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [send]);

  const stopTracks = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        console.log(`Stopping track: ${track.kind} (${track.label})`);
        track.stop();
      });
      streamRef.current = null;
    }
  }, []);

  const blobToBase64 = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove the data URL prefix
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const emitChunk = useCallback(
    async (blob: Blob) => {
      // Use ref instead of state to avoid timing issues
      const sessionId = currentSessionIdRef.current;
      
      if (!sessionId) {
        console.warn("No session ID, skipping chunk emission");
        return;
      }
      
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        console.warn("Socket not connected, skipping chunk emission");
        return;
      }
      
      sequenceRef.current += 1;
      const endedAt = Date.now();
      const startedAt = endedAt - CHUNK_DURATION_MS;

      try {
        const audioBase64 = await blobToBase64(blob);
        console.log(`Emitting chunk ${sequenceRef.current} for session ${sessionId}, size: ${blob.size} bytes`);
        
        socket.emit("session:chunk", {
          sessionId: sessionId,
          sequence: sequenceRef.current,
          startedAt,
          endedAt,
          speakerTag: "speaker",
          audio: audioBase64
        });
      } catch (error) {
        console.error("Error emitting chunk:", error);
      }
    },
    []
  );

  const getBrowserCompatibilityError = (): string | null => {
    if (typeof window === 'undefined') {
      return 'This feature is only available in the browser';
    }
    
    if (!navigator?.mediaDevices) {
      return 'Media devices are not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.';
    }
    
    if (!navigator.mediaDevices.getUserMedia) {
      return 'getUserMedia API is not supported. Please update your browser.';
    }
    
    if (!window.MediaRecorder) {
      return 'MediaRecorder API is not supported. Please use a modern browser.';
    }
    
    // Check for secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext || 
      window.location.protocol === 'https:' || 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
      
    if (!isSecureContext) {
      return 'Audio recording requires HTTPS or localhost. Please use a secure connection.';
    }
    
    return null;
  };

  const createRecorder = useCallback(async (source: RecordingSource) => {
    console.log('Creating recorder for source:', source);
    
    const compatibilityError = getBrowserCompatibilityError();
    if (compatibilityError) {
      throw new Error(compatibilityError);
    }

    let stream: MediaStream;
    
    try {
      if (source === "TAB") {
        // Check if getDisplayMedia is available
        if (!navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Screen/tab capture is not supported in this browser');
        }
        
        console.log('Requesting tab audio capture...');
        stream = await navigator.mediaDevices.getDisplayMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          } as MediaTrackConstraints,
          video: false 
        });
      } else {
        console.log('Requesting microphone access...');
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: { ideal: 48000 },
          },
          video: false
        });
      }
      
      console.log('Media stream obtained successfully');
      console.log('Audio tracks:', stream.getAudioTracks().map(t => ({
        label: t.label,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState
      })));
      
    } catch (error) {
      console.error('Error obtaining media stream:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Microphone access denied. Please allow microphone access and try again.');
        } else if (error.name === 'NotFoundError') {
          throw new Error('No microphone found. Please connect a microphone and try again.');
        } else if (error.name === 'NotReadableError') {
          throw new Error('Microphone is already in use by another application.');
        } else if (error.name === 'OverconstrainedError') {
          throw new Error('Unable to access microphone with the required settings.');
        }
      }
      
      throw new Error(`Failed to access ${source === 'TAB' ? 'tab audio' : 'microphone'}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    streamRef.current = stream;
    
    // Determine best MIME type
    const preferredMimeTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    
    const supportedMimeType = preferredMimeTypes.find(type => 
      MediaRecorder.isTypeSupported(type)
    );
    
    if (!supportedMimeType) {
      console.warn('No preferred MIME type supported, using browser default');
    } else {
      console.log('Using MIME type:', supportedMimeType);
    }

    let recorder: MediaRecorder;
    
    try {
      const options: MediaRecorderOptions = supportedMimeType 
        ? { mimeType: supportedMimeType, audioBitsPerSecond: 128000 }
        : { audioBitsPerSecond: 128000 };
        
      recorder = new MediaRecorder(stream, options);
      console.log('MediaRecorder created successfully');
      console.log('MediaRecorder state:', recorder.state);
      console.log('MediaRecorder mimeType:', recorder.mimeType);
      
    } catch (error) {
      console.error('Error creating MediaRecorder:', error);
      throw new Error(`Failed to initialize recording: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Reset chunks when starting new recording
    chunksRef.current = [];

    recorder.ondataavailable = async (event) => {
      console.log('Data available event, size:', event.data.size);
      
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
        console.log('Chunk added, total chunks:', chunksRef.current.length);
        
        // Emit chunk to server
        try {
          await emitChunk(event.data);
        } catch (error) {
          console.error('Error emitting chunk:', error);
        }
      }
    };

    recorder.onstart = () => {
      console.log('MediaRecorder started');
    };

    recorder.onstop = () => {
      console.log('MediaRecorder stopped');
      console.log('Total chunks collected:', chunksRef.current.length);
    };
    
    recorder.onerror = (event: Event) => {
      const errorEvent = event as ErrorEvent;
      console.error('MediaRecorder error:', errorEvent.error);
      send({ 
        type: "ERROR", 
        error: `Recording error: ${errorEvent.error?.message || 'Unknown error'}`
      });
    };
    
    // Track ended handlers
    stream.getAudioTracks().forEach(track => {
      track.onended = () => {
        console.log('Audio track ended unexpectedly');
        if (recorder.state === 'recording') {
          send({ 
            type: "ERROR", 
            error: 'Recording stopped: Audio input was disconnected' 
          });
        }
      };
      
      track.onmute = () => {
        console.warn('Audio track muted');
      };
      
      track.onunmute = () => {
        console.log('Audio track unmuted');
      };
    });

    recorderRef.current = recorder;
    return recorder;
  }, [emitChunk, send]);

  const startRecording = useCallback(
    async (source: RecordingSource) => {
      console.log('Starting recording with source:', source);
      
      const compatibilityError = getBrowserCompatibilityError();
      if (compatibilityError) {
        console.error('Browser compatibility error:', compatibilityError);
        send({ type: "ERROR", error: compatibilityError });
        return;
      }
      
      try {
        // Ensure socket is connected
        let socket = socketRef.current;
        if (!socket || !socket.connected) {
          console.log('Creating new socket connection...');
          socket = createSocket();
          socketRef.current = socket;
          
          // Wait for connection
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
            socket!.once('connect', () => {
              clearTimeout(timeout);
              console.log('Socket connected');
              resolve();
            });
            socket!.once('connect_error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
        }

        const sessionId = crypto.randomUUID();
        console.log('Starting session:', sessionId);
        
        // Reset sequence counter
        sequenceRef.current = 0;
        
        // Update state machine
        send({ type: "START", sessionId, source });

        // Emit session start to server
        socket.emit("session:start", {
          sessionId,
          userId: user.id,
          userEmail: user.email,
          source
        });

        // Create and start recorder
        const recorder = await createRecorder(source);
        
        console.log('Starting MediaRecorder with timeslice:', CHUNK_DURATION_MS);
        recorder.start(CHUNK_DURATION_MS);
        
        console.log('Recording started successfully with session ID:', sessionId);
        
      } catch (err) {
        console.error('Error starting recording:', err);
        const message = err instanceof Error ? err.message : "Unable to start recorder";
        send({ type: "ERROR", error: message });
      }
    },
    [send, user.email, user.id, createRecorder]
  );

  const pauseRecording = useCallback(() => {
    console.log('Pausing recording...');
    
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.pause();
      socketRef.current?.emit("session:pause", {
        sessionId: state.context.sessionId
      });
      send({ type: "PAUSE" });
      console.log('Recording paused');
    } else {
      console.warn('Cannot pause: recorder not in recording state');
    }
  }, [send, state.context.sessionId]);

  const resumeRecording = useCallback(() => {
    console.log('Resuming recording...');
    
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'paused') {
      recorder.resume();
      socketRef.current?.emit("session:resume", {
        sessionId: state.context.sessionId
      });
      send({ type: "RESUME" });
      console.log('Recording resumed');
    } else {
      console.warn('Cannot resume: recorder not in paused state');
    }
  }, [send, state.context.sessionId]);

  const stopRecording = useCallback(async () => {
    console.log('Stopping recording...');
    
    const recorder = recorderRef.current;
    const socket = socketRef.current;
    
    if (!recorder) {
      console.warn('No recorder to stop');
      send({ type: "STOP" });
      return;
    }
    
    if (recorder.state === 'inactive') {
      console.warn('Recorder already inactive');
      stopTracks();
      send({ type: "STOP" });
      return;
    }
    
    try {
      // Create promise that resolves when recorder stops
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => {
          console.log('Recorder stopped event fired');
          resolve();
        };
      });
      
      // Stop the recorder
      recorder.stop();
      
      // Stop all tracks
      stopTracks();
      
      // Wait for recorder to stop (with timeout)
      await Promise.race([
        stopped,
        new Promise(resolve => setTimeout(resolve, 3000))
      ]);
      
      // Emit stop event to server
      if (socket?.connected && state.context.sessionId) {
        console.log('Emitting session:stop to server');
        socket.emit("session:stop", {
          sessionId: state.context.sessionId
        });
      }
      
      console.log('Recording stopped successfully');
      send({ type: "STOP" });
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      stopTracks();
      send({ 
        type: "ERROR", 
        error: `Failed to stop recording: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }, [send, state.context.sessionId, stopTracks]);

  const reset = useCallback(() => {
    console.log('Resetting recorder...');
    
    // Stop recorder if active
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    
    // Stop all tracks
    stopTracks();
    
    // Clear refs
    recorderRef.current = null;
    sequenceRef.current = 0;
    chunksRef.current = [];
    currentSessionIdRef.current = undefined;
    
    console.log('Reset complete');
    send({ type: "RESET" });
  }, [send, stopTracks]);

  const setSource = useCallback(
    (source: RecordingSource) => {
      if (state.value !== 'idle') {
        console.warn('Cannot change source while recording');
        return;
      }
      send({ type: "SET_SOURCE", source });
    },
    [send, state.value]
  );

  return {
    isSupported,
    browserError: browserError || state.context.error,
    status,
    transcript: state.context.transcript,
    summary: state.context.summary,
    error: state.context.error,
    source: state.context.source,
    sessionId: state.context.sessionId,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
    setSource
  };
}