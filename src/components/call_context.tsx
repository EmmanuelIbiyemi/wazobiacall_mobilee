import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { ConnectionState, DisconnectReason, Room, RoomEvent } from "livekit-client";
import { AudioSession } from "@livekit/react-native";
import {
  LIVEKIT_URL,
  fetchCallToken,
  endCallRoom,
  CallBusyError,
  CallStartRejectedError,
} from "../utils/livekit";

const CALL_CHANNEL_ID = "active-call";
const CALL_NOTIFICATION_ID = "active-call";
const CALL_CATEGORY_ID = "active-call-category";
const ACTION_HANGUP = "hangup-call";
const INCOMING_CALL_NOTIFICATION_ID = "incoming-call";
const INCOMING_CALL_CHANNEL_ID = "incoming-call-custom-sound";
const INCOMING_CALL_CATEGORY_ID = "incoming-call-category";
const INCOMING_CALL_SOUND = "custom_sound.wav";
export const ACTION_ANSWER_INCOMING_CALL = "answer-incoming-call";
export const ACTION_DECLINE_INCOMING_CALL = "decline-incoming-call";

function normalizePhoneNumber(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return `+${digits}`;
}

function isRoomDisconnected(room: Room): boolean {
  return room.state === ConnectionState.Disconnected;
}

// Signals a dropped/bad link rather than a normal hang-up. Matches are kept
// tight so unrelated errors (e.g. "microphone device") are not misread.
function isNetworkFailure(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (!message) return false;
  return (
    message.includes("negotiation") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection failed") ||
    // ICE as a standalone token; a plain substring would also match "device".
    /\bice\b/.test(message)
  );
}

// Disconnect reasons that mean the connection itself failed.
const NETWORK_DISCONNECT_REASONS = new Set<DisconnectReason>([
  DisconnectReason.SIGNAL_CLOSE,
  DisconnectReason.UNKNOWN_REASON,
  DisconnectReason.JOIN_FAILURE,
  DisconnectReason.STATE_MISMATCH,
]);

// Raised by LiveKit when a negotiation fires while the peer connection is being
// torn down — e.g. hanging up at the same moment the mic is being published.
// It is expected during hang-up and must not surface as an error.
function isPcManagerClosed(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  return message.includes("pc manager is closed");
}

// How long to keep trying to reconnect before giving up on the call.
const RECONNECT_GRACE_MS = 8000;
// How long a failure notice stays on the call screen before hanging up.
const NOTICE_DURATION_MS = 3000;
// LiveKit defaults both connect timeouts to 15s, which is tight on slow mobile
// networks. "signal" is the websocket handshake, so give it more room before
// treating the call as failed.
const CONNECT_TIMEOUT_MS = 30_000;
// Unpublishing the mic can stall on a bad link. Hanging up must never wait on
// it, so give it a short budget and disconnect regardless.
const MIC_RELEASE_TIMEOUT_MS = 1500;

// Resolve after `ms`, so a stuck promise can never block call teardown.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);
}

export type ActiveCall = {
  name: string;
  number: string;
  room: string;
  direction: "outgoing" | "incoming";
  startedAt: number;
  connectedAt: number | null;
};

type CallContextValue = {
  activeCall: ActiveCall | null;
  elapsedSeconds: number;
  isConnected: boolean;
  isMuted: boolean;
  isSpeaker: boolean;
  callNotice: string | null;
  livekitState: "connected" | "reconnecting" | null;
  startCall: (name: string, number: string) => void;
  answerCall: (name: string, number: string, room: string, token: string) => void;
  endCall: () => void;
  endCallWithNotice: (message: string) => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

type NotificationsModule = typeof import("expo-notifications");

// expo-notifications loads its native module at import time, which throws on a
// build that predates the package. Import it lazily and behind a try/catch so
// this module (and every route importing it) always evaluates.
function resolveNotifications(imported: unknown): NotificationsModule | null {
  if (!imported || typeof imported !== "object") return null;

  const direct = imported as Partial<NotificationsModule>;
  if (typeof direct.setNotificationHandler === "function") {
    return direct as NotificationsModule;
  }

  // Some bundlers hand back the module under `default`.
  const nested = (imported as { default?: Partial<NotificationsModule> }).default;
  if (nested && typeof nested.setNotificationHandler === "function") {
    return nested as NotificationsModule;
  }

  console.warn(
    "expo-notifications has an unexpected module shape; keys:",
    Object.keys(imported as object)
  );
  return null;
}

export async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web") return null;
  try {
    return resolveNotifications(await import("expo-notifications"));
  } catch (error) {
    console.warn("expo-notifications is not available in this build:", error);
    return null;
  }
}

async function prepareNotifications(): Promise<NotificationsModule | null> {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  try {
    if (typeof Notifications.setNotificationHandler === "function") {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }

    if (typeof Notifications.setNotificationChannelAsync === "function") {
      await Notifications.setNotificationChannelAsync(CALL_CHANNEL_ID, {
        name: "Ongoing call",
        importance: Notifications.AndroidImportance.HIGH,
      });
      await Notifications.setNotificationChannelAsync(INCOMING_CALL_CHANNEL_ID, {
        name: "Incoming calls",
        importance: Notifications.AndroidImportance.HIGH,
        sound: INCOMING_CALL_SOUND,
        vibrationPattern: [0, 500, 250, 500, 250, 800],
        enableVibrate: true,
      });
    }

    if (typeof Notifications.setNotificationCategoryAsync === "function") {
      await Notifications.setNotificationCategoryAsync(CALL_CATEGORY_ID, [
        {
          identifier: ACTION_HANGUP,
          buttonTitle: "Hang up",
          options: {
            opensAppToForeground: true,
            isDestructive: true,
          },
        },
      ]);
      await Notifications.setNotificationCategoryAsync(INCOMING_CALL_CATEGORY_ID, [
        {
          identifier: ACTION_ANSWER_INCOMING_CALL,
          buttonTitle: "🟢 Answer",
          options: {
            opensAppToForeground: true,
          },
        },
        {
          identifier: ACTION_DECLINE_INCOMING_CALL,
          buttonTitle: "🔴 Decline",
          options: {
            opensAppToForeground: true,
            isDestructive: true,
          },
        },
      ]);
    }
  } catch (error) {
    console.warn("Notification setup failed:", error);
  }

  return Notifications;
}

export async function showIncomingCallNotification(call: {
  room: string;
  callerName: string;
  caller: string;
}) {
  const Notifications = await prepareNotifications();
  if (!Notifications) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: INCOMING_CALL_NOTIFICATION_ID,
      content: {
        title: "Incoming call",
        body: `${call.callerName} · ${call.caller}`,
        sticky: true,
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority.MAX,
        sound: INCOMING_CALL_SOUND,
        categoryIdentifier: INCOMING_CALL_CATEGORY_ID,
        data: {
          room: call.room,
          caller: call.caller,
          callerName: call.callerName,
        },
      },
      trigger: { channelId: INCOMING_CALL_CHANNEL_ID },
    });
  } catch (error) {
    console.warn("Could not show incoming call notification:", error);
  }
}

export async function dismissIncomingCallNotification() {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    if (typeof Notifications.dismissNotificationAsync === "function") {
      await Notifications.dismissNotificationAsync(INCOMING_CALL_NOTIFICATION_ID);
    }
    if (typeof Notifications.cancelScheduledNotificationAsync === "function") {
      await Notifications.cancelScheduledNotificationAsync(
        INCOMING_CALL_NOTIFICATION_ID
      );
    }
  } catch (error) {
    console.warn("Could not dismiss incoming call notification:", error);
  }
}

async function showCallNotification(call: ActiveCall) {
  const Notifications = await prepareNotifications();
  if (!Notifications) return;

  if (typeof Notifications.scheduleNotificationAsync !== "function") {
    console.warn("expo-notifications: scheduleNotificationAsync is unavailable");
    return;
  }

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: CALL_NOTIFICATION_ID,
      content: {
        title: "Call in progress",
        body: `${call.name} · ${call.number}`,
        sticky: true,
        autoDismiss: false,
        color: "#1D5BD8",
        sound: false,
        categoryIdentifier: CALL_CATEGORY_ID,
        data: { action: "active_call" },
      },
      trigger: { channelId: CALL_CHANNEL_ID },
    });
  } catch (error) {
    console.warn("Could not show call notification:", error);
  }
}

async function dismissCallNotification() {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    if (typeof Notifications.dismissNotificationAsync === "function") {
      await Notifications.dismissNotificationAsync(CALL_NOTIFICATION_ID);
    }
    if (typeof Notifications.cancelScheduledNotificationAsync === "function") {
      await Notifications.cancelScheduledNotificationAsync(CALL_NOTIFICATION_ID);
    }
  } catch (error) {
    console.warn("Could not dismiss call notification:", error);
  }
}

export function CallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [livekitState, setLivekitState] = useState<
    "connected" | "reconnecting" | null
  >(null);
  const isMutedRef = useRef(false);
  const isSpeakerRef = useRef(false);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const roomRef = useRef<Room | null>(null);
  const roomNameRef = useRef<string | null>(null);
  const endCallRef = useRef<() => void>(() => {});
  // True while a call is being torn down, so nothing starts a new negotiation.
  const isClosingRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Notification responses already acted on, so a hang-up runs once.
  const handledHangupIdsRef = useRef(new Set<string>());

  const clearCallTimers = useCallback(() => {
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  // Show a short-lived notice on the call screen, then hang up.
  const failCall = useCallback(
    (message: string) => {
      setCallNotice(message);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => {
        noticeTimerRef.current = null;
        setCallNotice(null);
        endCallRef.current();
      }, NOTICE_DURATION_MS);
    },
    []
  );

  // Enables/disables the microphone through LiveKit. The first enable triggers
  // the native microphone permission prompt.
  const setMicEnabled = useCallback(async (enabled: boolean) => {
    const room = roomRef.current;
    if (!room || isClosingRef.current || isRoomDisconnected(room)) {
      console.log("LiveKit: no active room, microphone not changed.");
      return;
    }
    try {
      await room.localParticipant.setMicrophoneEnabled(enabled);
      console.log(
        enabled
          ? "LiveKit: microphone enabled (streaming)."
          : "LiveKit: microphone disabled (muted)."
      );
    } catch (error) {
      // Hanging up mid-toggle tears the peer connection down; that is expected.
      if (!isPcManagerClosed(error)) {
        console.log("Microphone permission error:", error);
      }
    }
  }, []);

  // Connects to a LiveKit room with an existing token and enables the mic.
  // The call timer starts only once both parties are in the room (a remote
  // participant connects), and the call ends if the remote side leaves.
  const joinRoom = useCallback(async (roomName: string, token: string) => {
    if (Platform.OS === "web") return;
    const callBeingJoined = activeCallRef.current;
    if (!callBeingJoined) return;

    let joiningRoom: Room | null = null;
    try {
      const room = new Room();
      joiningRoom = room;
      roomRef.current = room;
      roomNameRef.current = roomName;

      const isExpectedRemoteParticipant = (remoteIdentity: string) => {
        const call = activeCallRef.current;
        return Boolean(
          call &&
            call === callBeingJoined &&
            normalizePhoneNumber(remoteIdentity) ===
              normalizePhoneNumber(call.number)
        );
      };

      const logCallConnected = (remoteIdentity: string) => {
        if (!isExpectedRemoteParticipant(remoteIdentity)) return;
        const call = activeCallRef.current;
        const localNumber = normalizePhoneNumber(room.localParticipant.identity);
        const callerNumber =
          call?.direction === "incoming"
            ? normalizePhoneNumber(call.number)
            : localNumber;
        const calleeNumber =
          call?.direction === "incoming"
            ? localNumber
            : normalizePhoneNumber(call?.number ?? "");
        console.log("[call] connected", {
          caller1: callerNumber,
          caller2: calleeNumber,
        });
      };

      room.on(RoomEvent.ParticipantConnected, (participant) => {
        if (!isExpectedRemoteParticipant(participant.identity)) return;
        logCallConnected(participant.identity);
        setActiveCall((prev) =>
          prev && prev.connectedAt == null
            ? { ...prev, connectedAt: Date.now() }
            : prev
        );
      });

      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        if (!isExpectedRemoteParticipant(participant.identity)) return;
        // Let LiveKit finish processing the participant event before closing
        // this peer connection.
        setTimeout(() => {
          if (roomRef.current === room && activeCallRef.current === callBeingJoined) {
            endCallRef.current();
          }
        }, 0);
      });

      // Watch for a link that drops mid-call. Give LiveKit a moment to recover
      // before treating it as a poor network and ending the call.
      room.on(RoomEvent.Reconnecting, () => {
        if (activeCallRef.current !== callBeingJoined) return;
        console.log("[call] reconnecting...");
        setLivekitState("reconnecting");
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (activeCallRef.current === callBeingJoined) {
            failCall("Poor network");
          }
        }, RECONNECT_GRACE_MS);
      });

      room.on(RoomEvent.Reconnected, () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        if (activeCallRef.current === callBeingJoined) {
          setLivekitState("connected");
        }
      });

      room.on(RoomEvent.Disconnected, (reason) => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        if (activeCallRef.current !== callBeingJoined) return;
        if (reason === undefined) return;
        if (!NETWORK_DISCONNECT_REASONS.has(reason)) return;
        console.log("[call] connection dropped:", reason);
        failCall("Poor network");
      });

      // Warm up the peer connection so negotiation has a head start; this is
      // what usually prevents "negotiation timed out" on slow links.
      try {
        await room.prepareConnection(LIVEKIT_URL, token);
      } catch (error) {
        console.warn("Could not pre-warm the connection:", error);
      }

      // Activate the platform audio session before connecting so the call
      // keeps its audio (and microphone) alive when the app is backgrounded.
      try {
        await AudioSession.startAudioSession();
      } catch (error) {
        console.warn("Could not start the audio session:", error);
      }

      await room.connect(LIVEKIT_URL, token, {
        websocketTimeout: CONNECT_TIMEOUT_MS,
        peerConnectionTimeout: CONNECT_TIMEOUT_MS,
      });
      if (
        roomRef.current !== room ||
        activeCallRef.current !== callBeingJoined ||
        isClosingRef.current ||
        isRoomDisconnected(room)
      ) {
        if (roomRef.current === room) roomRef.current = null;
        if (!isRoomDisconnected(room)) await room.disconnect();
        return;
      }
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (error) {
        // Hanging up while the mic publishes closes the PC manager first.
        if (!isPcManagerClosed(error)) throw error;
      }
      if (
        roomRef.current !== room ||
        activeCallRef.current !== callBeingJoined ||
        isClosingRef.current ||
        isRoomDisconnected(room)
      ) {
        return;
      }
      console.log("LiveKit: connected and microphone enabled.");
      setLivekitState("connected");

      // `ParticipantConnected` only fires for participants who join *after* us.
      // When we join a room the other side is already in (e.g. the callee
      // answering), mark the call as connected straight away.
      if (room.remoteParticipants.size > 0) {
        const expectedRemoteNumber = normalizePhoneNumber(
          activeCallRef.current?.number ?? ""
        );
        const remoteParticipant = Array.from(
          room.remoteParticipants.values()
        ).find(
          (participant) =>
            normalizePhoneNumber(participant.identity) === expectedRemoteNumber
        );
        if (remoteParticipant) {
          logCallConnected(remoteParticipant.identity);
          setActiveCall((prev) =>
            prev && prev.connectedAt == null
              ? { ...prev, connectedAt: Date.now() }
              : prev
          );
        }
      }
    } catch (error) {
      // Only these mean the call was deliberately replaced or hung up. A room
      // that disconnected because the connection failed must NOT count as
      // cancelled, or the failure would be swallowed silently.
      const cancelled =
        (joiningRoom !== null && roomRef.current !== joiningRoom) ||
        activeCallRef.current !== callBeingJoined ||
        isClosingRef.current;

      if (cancelled) {
        if (joiningRoom && roomRef.current === joiningRoom) {
          roomRef.current = null;
        }
        if (joiningRoom && !isRoomDisconnected(joiningRoom)) {
          try {
            await joiningRoom.disconnect();
          } catch (disconnectError) {
            if (
              !isRoomDisconnected(joiningRoom) &&
              !isPcManagerClosed(disconnectError)
            ) {
              console.warn("Could not close cancelled LiveKit room:", disconnectError);
            }
          }
        }
        return;
      }
      // A hang-up during connect is not a microphone problem.
      if (isPcManagerClosed(error)) return;
      // Anything else that killed the link (e.g. "room connection has timed
      // out (signal)") is a network failure: tell the user, then hang up.
      if (isNetworkFailure(error)) {
        console.log("[call] connection failed (network):", error);
        failCall("Poor network — call ending");
        return;
      }
      console.log("Microphone permission error:", error);
    }
  }, [failCall]);

  // Mints a token for an outgoing call, then joins the room.
  const startMic = useCallback(
    async (callee: string) => {
      try {
        const callBeingStarted = activeCallRef.current;
        if (
          !callBeingStarted ||
          callBeingStarted.direction !== "outgoing" ||
          normalizePhoneNumber(callBeingStarted.number) !==
            normalizePhoneNumber(callee)
        ) {
          return;
        }
        const { room, token } = await fetchCallToken(callee);
        if (activeCallRef.current !== callBeingStarted) {
          // The user hung up while the token was in flight. Nobody may have
          // joined yet, but the backend already created the room, so end it.
          void endCallRoom(room);
          return;
        }
        // Remember the room as soon as we know it, so hanging up during
        // "Connecting..." still tears the room down on the backend.
        roomNameRef.current = room;
        setActiveCall((prev) => (prev ? { ...prev, room } : prev));
        await joinRoom(room, token);
      } catch (error) {
        // Keep the call screen up only if this is still the current call.
        if (error instanceof CallBusyError) {
          console.log("[call] rejected:", error.reason);
          if (activeCallRef.current) failCall("Line busy");
          return;
        }
        if (error instanceof CallStartRejectedError) {
          console.log("[call] rejected:", error.message);
          if (activeCallRef.current) {
            failCall(error.message);
          }
          return;
        }
        console.log("Call start error:", error);
        if (activeCallRef.current) {
          failCall("Unable to start the call. Please try again.");
        }
      }
    },
    [joinRoom, failCall]
  );

  // Leaves the LiveKit room (end of call).
  const stopMic = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    // Mark the teardown so nothing (including a pending mic enable) negotiates.
    isClosingRef.current = true;

    if (room && !isRoomDisconnected(room)) {
      // Unpublish the microphone first, but never let it block the hang-up:
      // if the link is bad this can stall, and the room must still close.
      try {
        await withTimeout(
          room.localParticipant.setMicrophoneEnabled(false),
          MIC_RELEASE_TIMEOUT_MS
        );
      } catch (error) {
        if (!isPcManagerClosed(error)) {
          console.warn("Could not release the microphone:", error);
        }
      }
      // Always disconnect, even if the mic release above timed out.
      try {
        await room.disconnect();
        console.log("LiveKit: room disconnected.");
      } catch (error) {
        if (!isRoomDisconnected(room) && !isPcManagerClosed(error)) {
          console.log("Error disconnecting LiveKit room:", error);
        }
      }
    }
    // Release the audio session once the call is over.
    try {
      await withTimeout(AudioSession.stopAudioSession(), MIC_RELEASE_TIMEOUT_MS);
    } catch (error) {
      console.warn("Could not stop the audio session:", error);
    }
  }, []);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMutedRef.current;
    isMutedRef.current = nextMuted;
    setIsMuted(nextMuted);
    void setMicEnabled(!nextMuted);
  }, [setMicEnabled]);

  // Routes call audio between the speakerphone and the earpiece.
  const toggleSpeaker = useCallback(() => {
    const nextSpeaker = !isSpeakerRef.current;
    isSpeakerRef.current = nextSpeaker;
    setIsSpeaker(nextSpeaker);

    (async () => {
      try {
        const outputs = await AudioSession.getAudioOutputs();
        let target: string | null = null;
        if (nextSpeaker) {
          // Android: "speaker"; iOS: "force_speaker".
          target =
            outputs.find((o) => o === "speaker" || o === "force_speaker") ?? null;
        } else {
          // Android: "earpiece"; iOS: "default".
          target =
            outputs.find((o) => o === "earpiece" || o === "default") ?? null;
        }
        if (target) {
          await AudioSession.selectAudioOutput(target);
        }
      } catch (error) {
        console.log("Speaker toggle failed:", error);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const Notifications = await prepareNotifications();
      if (!Notifications || cancelled) return;

      try {
        await Notifications.requestPermissionsAsync();
      } catch (error) {
        console.warn("Could not request notification permission:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The sticky status-bar notification lives exactly as long as the call does.
  useEffect(() => {
    if (activeCall) {
      void showCallNotification(activeCall);
    } else {
      void dismissCallNotification();
    }
  }, [activeCall]);

  // Tick the timer only once both parties are connected. Before that (ringing
  // / connecting) the elapsed time stays at zero. endCall resets it to zero.
  useEffect(() => {
    if (!activeCall) {
      setElapsedSeconds(0);
      return;
    }

    const connectedAt = activeCall.connectedAt;
    if (connectedAt == null) {
      setElapsedSeconds(0);
      return;
    }

    const tick = () =>
      setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1000));

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [activeCall]);

  const startCall = useCallback(
    (name: string, number: string) => {
      // One call at a time: if a call is already active, keep it.
      if (activeCallRef.current) return;
      console.log("[call] initiating", { caller2: normalizePhoneNumber(number) });
      const call = {
        name,
        number,
        room: "",
        direction: "outgoing" as const,
        startedAt: Date.now(),
        connectedAt: null,
      };
      activeCallRef.current = call;
      setActiveCall(call);
      // A new call starts unmuted with the microphone live.
      isMutedRef.current = false;
      setIsMuted(false);
      setCallNotice(null);
      clearCallTimers();
      isClosingRef.current = false;
      void startMic(number);
    },
    [startMic, clearCallTimers]
  );

  // Joins an incoming call using a token already minted by /accept.
  const answerCall = useCallback(
    (name: string, number: string, room: string, token: string) => {
      if (activeCallRef.current) return;
      const call = {
        name,
        number,
        room,
        direction: "incoming" as const,
        startedAt: Date.now(),
        connectedAt: null,
      };
      activeCallRef.current = call;
      setActiveCall(call);
      isMutedRef.current = false;
      setIsMuted(false);
      setCallNotice(null);
      clearCallTimers();
      isClosingRef.current = false;
      void joinRoom(room, token);
    },
    [joinRoom, clearCallTimers]
  );

  const endCall = useCallback(() => {
    const roomName = roomNameRef.current ?? activeCallRef.current?.room ?? null;
    console.log("[call] hanging up", { room: roomName || "(not joined yet)" });
    activeCallRef.current = null;
    roomNameRef.current = null;
    setActiveCall(null);
    setElapsedSeconds(0);
    setCallNotice(null);
    setLivekitState(null);
    clearCallTimers();
    isMutedRef.current = false;
    setIsMuted(false);
    isSpeakerRef.current = false;
    setIsSpeaker(false);
    void stopMic();
    if (roomName) {
      void endCallRoom(roomName);
    }
    // Always land back on the home screen, no matter how the call ended
    // (hang-up, poor network, busy line, or the other party leaving). This
    // prevents being left on the solid blue call screen after a failure.
    router.replace("/home/recentcalls");
  }, [stopMic, clearCallTimers]);

  // Keep a ref to the latest endCall so LiveKit event handlers don't go stale.
  endCallRef.current = endCall;

  // Listen for Hang Up action from the notification
  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let isMounted = true;

    // Minimal shape so we don't need a static expo-notifications import.
    const handleHangupAction = (actionId: string, identifier: string) => {
      if (actionId !== ACTION_HANGUP) return;
      // Ignore a stale response when no call is up, so it cannot end a later one.
      if (!activeCallRef.current) return;
      if (handledHangupIdsRef.current.has(identifier)) return;
      handledHangupIdsRef.current.add(identifier);
      void getNotifications().then((Notifications) =>
        Notifications?.clearLastNotificationResponseAsync()
      );
      console.log("[call] hang up from notification");
      endCallRef.current();
      // The call screen may already be navigating away, but route explicitly so
      // the notification hang-up always lands back on the home screen.
      router.replace("/home/recentcalls");
    };

    (async () => {
      const Notifications = await getNotifications();
      if (!Notifications || !isMounted) return;

      if (typeof Notifications.addNotificationResponseReceivedListener === "function") {
        subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          handleHangupAction(
            response.actionIdentifier,
            response.notification.request.identifier
          );
        });
      }

      // If the action was tapped while the app was backgrounded or killed, the
      // listener above never saw it. Recover it here.
      if (typeof Notifications.getLastNotificationResponseAsync === "function") {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (isMounted && last) {
          handleHangupAction(
            last.actionIdentifier,
            last.notification.request.identifier
          );
        }
      }
    })();

    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [endCall]);

  const isConnected = activeCall?.connectedAt != null;

  const value = useMemo(
    () => ({
      activeCall,
      elapsedSeconds,
      isConnected,
      isMuted,
      isSpeaker,
      callNotice,
      livekitState,
      startCall,
      answerCall,
      endCall,
      endCallWithNotice: failCall,
      toggleMute,
      toggleSpeaker,
    }),
    [
      activeCall,
      elapsedSeconds,
      isConnected,
      isMuted,
      isSpeaker,
      callNotice,
      livekitState,
      startCall,
      answerCall,
      endCall,
      failCall,
      toggleMute,
      toggleSpeaker,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return context;
}
