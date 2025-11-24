import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth API route handler
 * Handles all authentication endpoints
 */
export const { GET, POST } = toNextJsHandler(auth);

