import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/**
 * GET /api/sessions
 * Fetch all sessions for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Extract userId from Better Auth session
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId") || "demo-user"; // Temporary for demo

    const sessions = await prisma.session.findMany({
      where: { userId },
      include: {
        summary: true,
        transcript: {
          orderBy: { sequence: "asc" },
          take: 5 // Preview chunks only
        }
      },
      orderBy: { createdAt: "desc" },
      take: 20
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}

