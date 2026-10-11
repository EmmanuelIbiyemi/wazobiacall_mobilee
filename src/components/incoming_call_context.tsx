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
import type { NotificationResponse } from "expo-notifications";
import {
  BACKEND_URL,
  getAuthToken,
  loadAuthToken,
  onAuthTokenChange,
} from "../utils/endpoint";
import { acceptCall, declineCall } from "../utils/livekit";
import { getMe } from "../utils/auth";
import {
  ACTION_ANSWER_INCOMING_CALL,
  ACTION_DECLINE_INCOMING_CALL,
  dismissIncomingCallNotification,
  getNotifications,
  showIncomingCallNotification,
  useCall,
} from "./call_context";
import IncomingCallBanner from "./incoming_call_banner";

export type IncomingCall = {
  room: string;
  caller: string;
  callerName: string;
};

// Events forwarded to the call screen so it can speak the translation aloud.
// `partial` and `final` are never forwarded (and never rendered).
export type TtsEvent =
  | { type: "state"; state: string }
  | { type: "translation"; translated: string; lang: string };

type IncomingCallContextValue = {
  incomingCall: IncomingCall | null;
  signallingState: "connected" | "reconnecting" | null;
  subscribeTts: (listener: (event: TtsEvent) => void) => () => void;
};

const IncomingCallContext = createContext<IncomingCallContextValue | null>(null);

// Convert the backend HTTP(S) base URL into a WebSocket URL.
function signalingUrl(): string | null {
  if (!BACKEND_URL) return null;
  if (BACKEND_URL.startsWith("https://")) {
    return BACKEND_URL.replace(/^https:/, "wss:");
  }
  if (BACKEND_URL.startsWith("http://")) {
    return BACKEND_URL.replace(/^http:/, "ws:");
  }
  return BACKEND_URL;
}

export function IncomingCallProvider({ children }: { children: ReactNode }) {
  const { answerCall: joinIncomingCall, endCall, endCallWithNotice } = useCall();
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [signallingState, setSignallingState] = useState<
    "connected" | "reconnecting" | null
  >(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const identityRef = useRef<string | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectedDimTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const disposedRef = useRef(false);
  const handledNotificationActionsRef = useRef(new Set<string>());
  const ttsListenersRef = useRef(new Set<(event: TtsEvent) => void>());

  const subscribeTts = useCallback((listener: (event: TtsEvent) => void) => {
    ttsListenersRef.current.add(listener);
    return () => {
      ttsListenersRef.current.delete(listener);
    };
  }, []);

  const connect = useCallback(() => {
    if (Platform.OS === "web") return;

    const identity = identityRef.current;
    const base = signalingUrl();
    if (!identity || !base) return;

    // Reuse a live socket instead of opening a second one. connect() can be
    // called from more than one path (startup + auth-token change); without
    // this guard the server briefly holds two sockets for the same identity and
    // every event is delivered twice.
    const existing = socketRef.current;
    if (
      existing &&
      (existing.readyState === WebSocket.CONNECTING ||
        existing.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    // Close any existing socket before opening a new one.
    socketRef.current?.close();
    socketRef.current = null;

    const url = `${base}/voip_call/ws/${encodeURIComponent(identity)}`;
    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      console.log(`[incoming-call] signalling connected as ${identity}`);

      setSignallingState("connected");
      if (connectedDimTimerRef.current) clearTimeout(connectedDimTimerRef.current);
      connectedDimTimerRef.current = setTimeout(() => {
        connectedDimTimerRef.current = null;
        setSignallingState((prev) => (prev === "connected" ? null : prev));
      }, 5000);

      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send("ping");
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      let data: {
        event?: string;
        room?: string;
        caller?: string;
        callee?: string;
        caller_name?: string;
        speaker?: string;
        speaker_label?: string;
        listener?: string;
        text?: string;
        translated?: string;
        final?: boolean;
        language?: string;
        target_language?: string;
        state?: string;
        lang?: string;
      };
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (data.event === "transcription") {
        if (!data.text?.trim()) {
          console.warn("[STT frontend] received an empty transcription");
          return;
        }
        const callerNumber = data.caller || "unknown";
        const calleeNumber = data.callee || identityRef.current || "unknown";
        const speakerNumber = data.speaker || "unknown";
        const speaker =
          data.speaker_label ||
          (speakerNumber === callerNumber
            ? "Caller 1"
            : speakerNumber === calleeNumber
              ? "Caller 2"
              : "Unknown caller");
        const suffix = data.final ? "" : " (interim)";
        // Show which language was heard, so a wrong source language is obvious.
        console.log(
          `[STT frontend] [${speaker} | ${speakerNumber}] spoke (${data.language || "?"}): ${data.text}${suffix}`
        );
        // Always show what the other party should hear, even before a
        // translation engine is wired up.
        if (data.translated) {
          console.log(
            `[STT frontend]   -> in (${data.target_language || "?"}): ${data.translated}${suffix}`
          );
        }
      } else if (data.event === "state" && typeof data.state === "string") {
        const state = data.state;
        ttsListenersRef.current.forEach((listener) =>
          listener({ type: "state", state })
        );
      } else if (
        data.event === "translation" &&
        typeof data.translated === "string"
      ) {
        // Only forwarded to speak() — the text is never rendered anywhere.
        const translated = data.translated;
        const lang = data.lang || "yo";
        ttsListenersRef.current.forEach((listener) =>
          listener({ type: "translation", translated, lang })
        );
      } else if (data.event === "incoming_call" && data.room) {
        console.log("[call] incoming", {
          caller1: data.caller || "unknown",
          caller2: identityRef.current || "unknown",
        });
        const call = {
          room: data.room,
          caller: data.caller || "",
          callerName: data.caller_name || data.caller || "",
        };
        incomingCallRef.current = call;
        setIncomingCall(call);
        void showIncomingCallNotification(call);
      } else if (
        data.event === "call_declined" ||
        data.event === "call_ended" ||
        data.event === "call_cancelled"
      ) {
        const wasDeclined = data.event === "call_declined";
        incomingCallRef.current = null;
        setIncomingCall(null);
        void dismissIncomingCallNotification();
        // If we are the caller, show why it ended, then hang up here too.
        if (wasDeclined) {
          endCallWithNotice("Rejected");
        } else {
          endCall();
        }
      }
    };

    socket.onerror = () => {
      // A dropped signalling socket is routine (network blips, ngrok restarts)
      // and onclose already schedules the reconnect, so keep this short.
      console.log("[incoming-call] signalling socket dropped; retrying");
      setSignallingState("reconnecting");
    };

    socket.onclose = () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      socketRef.current = null;
      if (identityRef.current) {
        setSignallingState("reconnecting");
      }
      if (disposedRef.current) return;

      const delay = Math.min(1000 * 2 ** attemptRef.current, 30000);
      attemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => connect(), delay);
    };
    // endCall/endCallWithNotice are stable useCallbacks from the provider, so
    // this keeps `connect` identity stable and the socket does not churn.
  }, [endCall, endCallWithNotice]);

  // Establish the socket once the user is signed in (token available), and
  // reconnect whenever the auth token changes (sign in / sign out).
  useEffect(() => {
    disposedRef.current = false;

    const resolveAndConnect = async () => {
      if (!getAuthToken()) return;
      try {
        const me = await getMe();
        identityRef.current = me.phone_number || null;
        if (identityRef.current) connect();
      } catch (error) {
        console.log("[incoming-call] could not fetch profile", error);
      }
    };

    void resolveAndConnect();

    const unsubscribe = onAuthTokenChange((token) => {
      if (token) {
        void resolveAndConnect();
      } else {
        identityRef.current = null;
        incomingCallRef.current = null;
        setIncomingCall(null);
        void dismissIncomingCallNotification();
        socketRef.current?.close();
        socketRef.current = null;
      }
    });

    return () => {
      disposedRef.current = true;
      unsubscribe();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (connectedDimTimerRef.current) clearTimeout(connectedDimTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  const handleAnswer = useCallback(async (notificationCall?: IncomingCall) => {
    // Only accept the argument when it is a real call (press handlers pass an
    // event object, which has no `room`).
    const call = notificationCall?.room ? notificationCall : incomingCallRef.current;
    if (!call) return;
    incomingCallRef.current = null;
    setIncomingCall(null);
    void dismissIncomingCallNotification();

    try {
      let identity = identityRef.current;
      if (!identity) {
        await loadAuthToken();
        const me = await getMe();
        identity = me.phone_number || null;
        identityRef.current = identity;
      }
      if (!identity) throw new Error("Signed-in phone number is unavailable");
      const token = await acceptCall(call.room, identity);
      joinIncomingCall(call.callerName || call.caller, call.caller, call.room, token);
      router.replace("/home/call");
    } catch (error) {
      console.log("Answer failed", error);
    }
  }, [joinIncomingCall]);

  const handleDecline = useCallback((notificationCall?: IncomingCall) => {
    // See handleAnswer: ignore press events, they have no `room`.
    const call = notificationCall?.room ? notificationCall : incomingCallRef.current;
    if (!call) return;
    incomingCallRef.current = null;
    setIncomingCall(null);
    void dismissIncomingCallNotification();
    void declineCall(call.room).catch((error) =>
      console.log("Decline failed", error)
    );
  }, []);

  const handleNotificationResponse = useCallback(
    (response: NotificationResponse) => {
      const action = response.actionIdentifier;
      if (
        action !== ACTION_ANSWER_INCOMING_CALL &&
        action !== ACTION_DECLINE_INCOMING_CALL
      ) {
        return;
      }

      const data = response.notification.request.content.data as {
        room?: unknown;
        caller?: unknown;
        callerName?: unknown;
      };
      if (typeof data.room !== "string" || !data.room) return;

      const actionKey = `${response.notification.request.identifier}:${action}:${data.room}`;
      if (handledNotificationActionsRef.current.has(actionKey)) return;
      if (handledNotificationActionsRef.current.size >= 32) {
        handledNotificationActionsRef.current.clear();
      }
      handledNotificationActionsRef.current.add(actionKey);
      void getNotifications().then((Notifications) =>
        Notifications?.clearLastNotificationResponseAsync()
      );

      const call: IncomingCall = {
        room: data.room,
        caller: typeof data.caller === "string" ? data.caller : "",
        callerName:
          typeof data.callerName === "string" ? data.callerName : "",
      };
      if (action === ACTION_ANSWER_INCOMING_CALL) {
        void handleAnswer(call);
      } else {
        handleDecline(call);
      }
    },
    [handleAnswer, handleDecline]
  );

  useEffect(() => {
    let isMounted = true;
    let subscription: { remove: () => void } | null = null;

    const registerResponseListener = async () => {
      const Notifications = await getNotifications();
      if (
        !Notifications ||
        !isMounted ||
        typeof Notifications.addNotificationResponseReceivedListener !==
          "function"
      ) {
        return;
      }

      subscription =
        Notifications.addNotificationResponseReceivedListener(
          handleNotificationResponse
        );
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      if (isMounted && lastResponse) {
        handleNotificationResponse(lastResponse);
      }
    };

    void registerResponseListener();
    return () => {
      isMounted = false;
      subscription?.remove();
    };
  }, [handleNotificationResponse]);

  const value = useMemo(
    () => ({ incomingCall, signallingState, subscribeTts }),
    [incomingCall, signallingState, subscribeTts]
  );

  return (
    <IncomingCallContext.Provider value={value}>
      {children}
      {incomingCall ? (
        <IncomingCallBanner
          name={incomingCall.callerName}
          number={incomingCall.caller}
          onAnswer={() => void handleAnswer()}
          onDecline={() => handleDecline()}
        />
      ) : null}
    </IncomingCallContext.Provider>
  );
}

export function useIncomingCall() {
  const context = useContext(IncomingCallContext);
  if (!context) {
    throw new Error("useIncomingCall must be used within an IncomingCallProvider");
  }
  return context;
}