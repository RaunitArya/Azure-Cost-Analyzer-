/**
 * Central app configuration derived from environment variables.
 * Set VITE_API_URL in your .env file (see .env.example).
 */
export const config = {
  apiUrl:
    (import.meta.env.VITE_API_URL as string | undefined)
      ?.trim()
      .replace(/\/+$/, "") || "http://localhost:8000",
} as const;
