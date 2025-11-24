# ScribeAI

AI-powered meeting transcription and summarization tool built with Next.js 14, Gemini, Socket.io, and Postgres.

## Features

- 🎤 **Real-time Audio Transcription**: Capture audio from microphone or browser tab (Google Meet/Zoom)
- 🤖 **AI-Powered Summarization**: Automatic meeting summaries with key points, action items, and decisions
- 📝 **Live Transcript Streaming**: Real-time transcript updates via Socket.io
- 🔐 **Authentication**: Secure user authentication with Better Auth
- 💾 **Session Management**: Store and retrieve past sessions with full transcripts
- ⏸️ **Pause/Resume**: Control recording with pause and resume functionality
- 🎯 **Speaker Diarization**: Identify and label different speakers in meetings
- 📊 **Scalable Architecture**: Designed to handle long sessions (1+ hours) with chunked streaming

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript, Tailwind CSS, XState
- **Backend**: Node.js, Express, Socket.io
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Better Auth
- **AI**: Google Gemini API (transcription & summarization)
- **Real-time**: Socket.io for WebSocket communication

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database (local or cloud like Supabase)
- Google Gemini API key ([Get one here](https://ai.google.dev))

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd scribeai
npm install
```

### 2. Set Up Environment Variables

```bash
cp env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/scribeai"
GEMINI_API_KEY="your-gemini-api-key"
BETTER_AUTH_SECRET="generate-a-random-secret-here"
BETTER_AUTH_URL="http://localhost:3000"
SOCKET_SERVER_PORT="3100"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3100"
```

Generate `BETTER_AUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 3. Set Up Database

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate
```

### 4. Start Development Servers

```bash
npm run dev
```

This starts:
- Next.js app on `http://localhost:3000`
- Socket.io server on `http://localhost:3100`

### 5. Access the Application

1. Open `http://localhost:3000`
2. Sign up or sign in
3. Navigate to `/sessions` to start recording

## Architecture Overview

### System Flow

```mermaid
sequenceDiagram
    participant U as Browser
    participant S as Socket Server
    participant G as Gemini API
    participant DB as Postgres

    U->>S: auth token + startSession
    loop every 30s
        U->>S: audio chunk (base64 WebM/Opus)
        S->>G: transcribeAudio(chunk)
        G-->>S: transcript text + speaker
        S-->>U: socket event transcription:update
        S->>DB: store transcript chunk
    end
    U->>S: stopSession
    S->>DB: persist all transcript chunks
    S->>G: summarizeTranscript(full text)
    G-->>S: summary (keyPoints, actionItems, decisions)
    S->>DB: store summary & mark completed
    S-->>U: status:completed + summary
```

### Key Components

- **Client (`app/sessions/page.tsx`)**: Recording UI with XState machine for state management
- **Recorder Hook (`hooks/useRecorderMachine.ts`)**: Handles MediaRecorder, chunking, and Socket.io communication
- **Socket Server (`server/index.ts`)**: Receives audio chunks, transcribes via Gemini, manages sessions
- **Gemini Integration (`lib/gemini.ts`)**: Audio transcription and text summarization
- **API Routes (`app/api/`)**: REST endpoints for session management
- **Database (`prisma/schema.prisma`)**: User, Session, TranscriptChunk, Summary models

### Audio Processing Pipeline

1. **Capture**: Browser `MediaRecorder` captures audio (mic or tab share)
2. **Chunking**: Audio split into 30-second chunks (≈500 KB Opus)
3. **Encoding**: Chunks base64-encoded and sent via Socket.io
4. **Transcription**: Server sends chunks to Gemini API for transcription
5. **Streaming**: Transcript updates streamed back to client in real-time
6. **Storage**: Chunks stored in Postgres with sequence numbers
7. **Summarization**: On stop, full transcript sent to Gemini for summary

## Long Session Scalability

One-hour meetings can exceed 1 GB of raw PCM audio, so ScribeAI treats streaming, buffering, and persistence as separate workloads. On the client we normalize to 16 kHz mono, then chunk every 30 seconds (≈500 KB Opus) to keep memory deterministic. Each chunk carries monotonically increasing sequence IDs; the Socket server acknowledges IDs, letting the client requeue only missing ranges—critical when laptops sleep or a tab crashes. The Node server never stores more than N (configurable) chunks in RAM per session. Once a chunk is forwarded to Gemini it's flushed to ephemeral disk (`/tmp/sessions/{id}`) or an object store like S3, enabling replay if Gemini fails mid-stream. Processing and persistence run on worker queues so a burst of completions cannot block live ingest. Socket rooms are sharded across instances with Redis adapter, so concurrent enterprise users can scale horizontally. Summaries operate on concatenated transcript text rather than raw audio, reducing Gemini cost. Finally, every DB write is idempotent: transcript chunks use `(sessionId, sequence)` unique constraints, summaries use an upsert keyed by session. Together these strategies avoid memory bloat, allow resumable uploads, and keep the UI responsive even when dozens of users stream 60-minute meetings simultaneously.

## Project Structure

```
scribeai/
├── app/
│   ├── api/              # Next.js API routes
│   │   ├── auth/         # Better Auth endpoints
│   │   └── sessions/     # Session CRUD
│   ├── login/            # Authentication page
│   ├── sessions/         # Main recording dashboard
│   └── layout.tsx        # Root layout
├── components/
│   └── ui/               # Reusable UI components
├── hooks/
│   └── useRecorderMachine.ts  # XState recorder logic
├── lib/
│   ├── auth.ts           # Better Auth config
│   ├── gemini.ts         # Gemini API integration
│   ├── prisma.ts         # Prisma client
│   └── socket-client.ts   # Socket.io client
├── server/
│   └── index.ts          # Socket.io server
├── prisma/
│   └── schema.prisma     # Database schema
└── types/
    └── session.ts        # TypeScript types
```

## API Endpoints

### REST API

- `GET /api/sessions` - List user sessions
- `GET /api/sessions/[id]` - Get session details
- `DELETE /api/sessions/[id]` - Delete session
- `POST /api/auth/sign-in` - Sign in
- `POST /api/auth/sign-up` - Sign up

### Socket.io Events

**Client → Server:**
- `session:start` - Start new recording session
- `session:chunk` - Send audio chunk
- `session:pause` - Pause recording
- `session:resume` - Resume recording
- `session:stop` - Stop recording and process

**Server → Client:**
- `session:ack` - Session started confirmation
- `transcription:update` - New transcript chunk
- `session:status` - Status change (PAUSED, PROCESSING, COMPLETED)
- `session:error` - Error occurred

## Development

### Scripts

- `npm run dev` - Start Next.js + Socket server concurrently
- `npm run dev:next` - Start Next.js only
- `npm run dev:socket` - Start Socket server only
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - TypeScript type checking
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations

### Code Quality

- ESLint + Prettier for code formatting
- TypeScript for type safety
- Zod for runtime validation
- JSDoc comments for documentation

## Deployment

### Environment Variables

Ensure all environment variables are set in your production environment:

- `DATABASE_URL` - PostgreSQL connection string
- `GEMINI_API_KEY` - Google Gemini API key
- `BETTER_AUTH_SECRET` - Random secret for auth
- `BETTER_AUTH_URL` - Your production URL
- `SOCKET_SERVER_PORT` - Port for Socket.io server
- `NEXT_PUBLIC_SOCKET_URL` - Public Socket.io URL

### Database Migration

```bash
npm run prisma:migrate
```

### Build

```bash
npm run build
npm run start
```

## Troubleshooting

### Audio Not Recording

- Check browser permissions for microphone/tab sharing
- Ensure HTTPS in production (required for `getDisplayMedia`)
- Verify MediaRecorder API support in browser

### Transcription Not Working

- Verify `GEMINI_API_KEY` is set correctly
- Check Socket.io connection (browser console)
- Ensure audio chunks are being sent (check network tab)

### Database Connection Issues

- Verify `DATABASE_URL` format
- Ensure PostgreSQL is running
- Run `npm run prisma:migrate` to create tables

## License

MIT

## Contributing

Contributions welcome! Please open an issue or PR.
