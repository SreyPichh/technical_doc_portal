export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  /** Arbitrary payload returned to the client (e.g. a one-time password). */
  data?: Record<string, string>;
} | null;
