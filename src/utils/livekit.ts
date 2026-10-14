import { registerGlobals, setLogLevel } from "@livekit/react-native";
import { LogLevel } from "livekit-client";
import axios from "axios";
import { api } from "./endpoint";

// Must run once before any LiveKit room is created or used.
registerGlobals();

// LiveKit logs its own internal errors (e.g. "error reading from signal stream"
// when a call ends, or "room connection has timed out (signal)"). They are
// benign teardown/network churn, but they surface as red ERROR lines in the
// terminal and LogBox. Our own handling already tells the user when a call
// actually fails, so keep the library quiet by default.
// Re-enable for debugging with EXPO_PUBLIC_LIVEKIT_LOG_LEVEL.
const LOG_LEVEL_NAMES = ["trace", "debug", "info", "warn", "error", "silent"] as const;
type LogLevelName = (typeof LOG_LEVEL_NAMES)[number];

const configuredLogLevel = process.env.EXPO_PUBLIC_LIVEKIT_LOG_LEVEL?.trim().toLowerCase();
const isKnownLevel = LOG_LEVEL_NAMES.includes(configuredLogLevel as LogLevelName);
setLogLevel(isKnownLevel ? (configuredLogLevel as LogLevelName) : LogLevel.silent);

export const LIVEKIT_URL =
  process.env.EXPO_PUBLIC_LIVEKIT_URL ??
  "wss://wazobia-call-1jjdqfq8.livekit.cloud";

export type CallBusyReason = "line_busy" | "you_are_busy";

export class CallStartRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallStartRejectedError";
  }
}

// Raised when the backend rejects a call because a side is already in a call.
export class CallBusyError extends Error {
  reason: CallBusyReason;

  constructor(reason: CallBusyReason) {
    super(reason === "you_are_busy" ? "You are already on a call" : "Line busy");
    this.name = "CallBusyError";
    this.reason = reason;
  }
}

// Mint a LiveKit token for a new outgoing call to `callee`.
export async function fetchCallToken(
  callee: string
): Promise<{ room: string; token: string }> {
  try {
    const { data } = await api.post<{
      room?: string;
      token?: string;
      invitation_sent?: boolean;
      message?: string;
    }>("/voip_call/call", { callee });

    if (data.invitation_sent) {
      throw new CallStartRejectedError(
        data.message ?? "User don't exist in our app."
      );
    }

    if (!data.token || !data.room) {
      if (data.message) {
        throw new CallStartRejectedError(data.message);
      }
      throw new Error("Call API did not return a room/token");
    }

    return { room: data.room, token: data.token };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 409) {
      const detail = String(error.response.data?.detail ?? "");
      throw new CallBusyError(detail === "you_are_busy" ? "you_are_busy" : "line_busy");
    }
    throw error;
  }
}

// Accept an incoming call and receive a LiveKit token for the callee.
export async function acceptCall(
  room: string,
  identity: string
): Promise<string> {
  const { data } = await api.post<{ token?: string }>(
    `/voip_call/call/${room}/accept`,
    { identity }
  );

  if (!data.token) {
    throw new Error("Accept API did not return a token");
  }

  return data.token;
}

// Decline an incoming call.
export async function declineCall(room: string): Promise<void> {
  await api.post(`/voip_call/call/${room}/decline`);
}

// End an active call so the backend notifies the other party to hang up.
export async function endCallRoom(room: string): Promise<void> {
  try {
    await api.post(`/voip_call/call/${room}/end`);
  } catch {
    // Cleanup best-effort: the room may already be gone.
  }
}
