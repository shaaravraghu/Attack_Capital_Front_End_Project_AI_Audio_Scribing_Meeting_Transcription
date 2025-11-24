import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground font-sans">
      <main className="flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-16 px-8 py-24 sm:items-start sm:text-left">
        
        {/* Logo */}
        <Image
          src="/next.svg"
          alt="App Logo"
          width={100}
          height={20}
          priority
          className="dark:invert"
        />

        {/* Tagline pill */}
        <p className="rounded-full border border-foreground/10 px-4 py-1 text-sm uppercase tracking-wide text-foreground/70">
          Meetings → Transcripts → Summaries
        </p>

        {/* Hero section */}
        <div className="space-y-6 max-w-2xl">
          <h1 className="text-4xl font-semibold leading-tight md:text-6xl">
            Turn any meeting into an{" "}
            <span className="text-gradient">AI-searchable transcript</span>{" "}
            in seconds.
          </h1>

          <p className="text-lg text-foreground/70 md:text-xl">
            ScribeAI securely captures microphone or tab audio, streams it to 
            Gemini in real time, and returns diarized, summarized notes on stop.
          </p>
        </div>

        {/* Buttons */}
        <div className="flex flex-col gap-4 md:flex-row">
          <Button asChild size="lg">
            <a href="/login">Get Started</a>
          </Button>

          <Button asChild size="lg" variant="ghost">
            <a href="/sessions">Dashboard</a>
          </Button>
        </div>

        {/* Optional small footer links from starter template */}
        <div className="flex flex-col gap-2 text-sm opacity-70">
          <a
            href="https://nextjs.org/learn"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Learn Next.js
          </a>
          <a
            href="https://vercel.com/templates"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            Explore Templates
          </a>
        </div>
      </main>
    </div>
  );
}
