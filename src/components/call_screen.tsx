import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StatusBar,
  Pressable,
  ActivityIndicator,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import { useCall } from "./call_context";
import {
  useIncomingCall,
  type TtsEvent,
  type TranscriptEvent,
} from "./incoming_call_context";
import { speak, cleanupTts, warmUpTts } from "../utils/speak";

type CallScreenProps = {
  name: string;
  number: string;
  seconds: number;
  connected: boolean;
  notice?: string | null;
  onHangup: () => void;
};

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}`;
}

function getInitials(fullName: string): string {
  if (!fullName) return "AY";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase() || "AY";
}

type Bubble =
  | "idle"
  | "transcribing"
  | "translating"
  | "listening"
  | "preparing"
  | "speaking"
  | "error";

// Fixed labels only. The translated/original text is NEVER rendered.
const BUBBLE_LABELS: Record<Exclude<Bubble, "idle">, string> = {
  transcribing: "Transcribing...",
  translating: "Translating...",
  listening: "Listening...",
  preparing: "Getting voice...",
  speaking: "Speaking...",
  error: "Couldn't play voice",
};

const STATE_TO_BUBBLE: Record<string, Bubble> = {
  transcribing: "transcribing",
  translating: "translating",
  listening: "listening",
  idle: "idle",
};

export default function CallScreen({
  name,
  number,
  seconds,
  connected,
  notice,
  onHangup,
}: CallScreenProps) {
  // Show "Connecting..." until both parties are in the room, then the timer.
  const isCalling = !connected;
  const callerName = name && name !== "Unknown" ? name : "Amina Yusuf";
  const callerNumber = number || "+234 812 345 6789";
  const initials = getInitials(callerName);

  // Mute and speaker are managed in CallContext so the controls actually
  // change the microphone and audio output.
  const { isMuted, toggleMute, isSpeaker, toggleSpeaker } = useCall();
  const { subscribeTts, subscribeTranscript } = useIncomingCall();

  // One audio player for all TTS playback, created once for the call screen.
  const player = useAudioPlayer(null);
  const [bubble, setBubble] = useState<Bubble>("idle");
  const [captions, setCaptions] = useState<
    { id: number; speaker: string; text: string; final: boolean }[]
  >([]);
  const captionIdRef = useRef(0);
  const queueRef = useRef<{ translated: string; lang: string }[]>([]);
  const busyRef = useRef(false);
  const isEndingRef = useRef(false);
  const speechAbortControllerRef = useRef<AbortController | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const processNext = useCallback(async () => {
    if (busyRef.current || isEndingRef.current) return;
    const item = queueRef.current.shift();
    if (!item) return;
    busyRef.current = true;
    const controller = new AbortController();
    speechAbortControllerRef.current = controller;
    setBubble("preparing");
    try {
      await speak(item.translated, item.lang, player, controller.signal);
      if (isEndingRef.current || controller.signal.aborted) return;
      setBubble("speaking");
    } catch (error) {
      if (isEndingRef.current || controller.signal.aborted) return;
      console.log("TTS speak failed", error);
      queueRef.current = [];
      busyRef.current = false;
      setBubble("error");
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => {
        errorTimerRef.current = null;
        setBubble("idle");
      }, 3000);
    }
  }, [player]);

  const stopTts = useCallback(() => {
    isEndingRef.current = true;
    queueRef.current = [];
    busyRef.current = false;
    speechAbortControllerRef.current?.abort();
    speechAbortControllerRef.current = null;
    try {
      player.pause();
    } catch (error) {
      console.warn("Could not stop call audio:", error);
    }
    cleanupTts();
  }, [player]);

  const handleHangup = useCallback(() => {
    stopTts();
    onHangup();
  }, [onHangup, stopTts]);

  const enqueue = useCallback(
    (translated: string, lang: string) => {
      queueRef.current.push({ translated, lang });
      void processNext();
    },
    [processNext]
  );

  const handleTtsEvent = useCallback(
    (event: TtsEvent) => {
      if (isEndingRef.current) return;
      if (event.type === "translation") {
        enqueue(event.translated, event.lang || "yo");
      } else if (event.type === "state") {
        if (busyRef.current) return;
        setBubble(STATE_TO_BUBBLE[event.state] ?? "idle");
      }
    },
    [enqueue]
  );

  // Warm up the TTS engine once when the call screen mounts.
  useEffect(() => {
    warmUpTts();
  }, []);

  // Receive TTS events forwarded from the signalling WebSocket.
  useEffect(() => {
    return subscribeTts(handleTtsEvent);
  }, [subscribeTts, handleTtsEvent]);

  // Render what is being said in the user's preferred language. The backend
  // already puts the listener's language in `translated`, so we show that.
  const handleTranscript = useCallback((event: TranscriptEvent) => {
    if (isEndingRef.current) return;
    const shown = (event.translated || event.text || "").trim();
    if (!shown) return;
    const speaker = event.speaker || "Unknown";
    setCaptions((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      // Keep interim (non-final) lines collapsed to a single live line.
      if (last && !last.final && last.speaker === speaker) {
        next[next.length - 1] = { ...last, text: shown, final: event.final };
      } else {
        captionIdRef.current += 1;
        next.push({
          id: captionIdRef.current,
          speaker,
          text: shown,
          final: event.final,
        });
      }
      return next.slice(-3);
    });
  }, []);

  // Receive live transcripts from the signalling WebSocket.
  useEffect(() => {
    return subscribeTranscript(handleTranscript);
  }, [subscribeTranscript, handleTranscript]);

  // Advance the queue when the current voice finishes playing.
  useEffect(() => {
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (!status.didJustFinish) return;
      cleanupTts();
      busyRef.current = false;
      setBubble("idle");
      void processNext();
    });
    return () => subscription.remove();
  }, [player, processNext]);

  // Fade the bubble in and out.
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: bubble === "idle" ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [bubble, opacity]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    isEndingRef.current = false;
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      stopTts();
    };
  }, [stopTts]);

  const handleDevTts = useCallback(() => {
    // Same path as a backend translation event, so you can test without a
    // second phone. Only built in development.
    handleTtsEvent({
      type: "translation",
      translated: "Bawo ni, I dey greet you!",
      lang: "yo",
    });
  }, [handleTtsEvent]);

  return (
    <SafeAreaView className="flex-1 bg-[#1D5BD8] pb-8">
      <StatusBar barStyle="light-content" backgroundColor="#1D5BD8" />

      {/* Top Header */}
      <View className="items-center pt-2">
        <View className="flex-row items-center justify-center space-x-1.5">
          <Text className="text-white font-black text-sm tracking-widest mr-1.5">
            文A
          </Text>
          <Text className="text-white text-xs font-semibold tracking-widest uppercase">
            WAZOBIA CALL
          </Text>
        </View>
      </View>

      {/* Caller Info Section */}
      <View className="items-center px-6 mt-4">
        {/* Avatar Circle */}
        <View className="w-24 h-24 rounded-full bg-white/20 items-center justify-center mb-4">
          <Text className="text-white text-3xl font-bold tracking-wider">
            {initials}
          </Text>
        </View>

        {/* Contact Name */}
        <Text className="text-white text-3xl font-bold text-center">
          {callerName}
        </Text>

        {/* Phone Number */}
        <Text className="text-white/75 text-sm font-medium mt-1 text-center">
          {callerNumber}
        </Text>

        {/* Calling vs Active vs failure details */}
        {notice ? (
          <View className="items-center mt-3">
            <View className="bg-red-500 px-4 py-1.5 rounded-full">
              <Text className="text-white text-xs font-bold">{notice}</Text>
            </View>
          </View>
        ) : isCalling ? (
          <View className="items-center mt-3">
            <View className="bg-white/15 px-4 py-1.5 rounded-full">
              <Text className="text-white/95 text-xs font-medium">Connecting...</Text>
            </View>
          </View>
        ) : (
          <View className="items-center mt-2">
            {/* Timer: • 02:14 */}
            <View className="flex-row items-center">
              <Text className="text-white font-bold text-base mr-1.5">•</Text>
              <Text className="text-white font-medium text-sm">
                {formatDuration(seconds)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Live translator panel: what the other party is saying, in my language. */}
      <View className="px-6 w-full mt-4">
        <View className="w-full bg-black/30 rounded-2xl px-4 py-3 min-h-[72px] border border-white/10">
          {captions.length > 0 ? (
            captions.map((line, index) => (
              <Text
                key={line.id}
                className={
                  "text-white leading-snug " +
                  (index === captions.length - 1 ? "text-base font-semibold" : "text-sm opacity-70") +
                  " mb-1"
                }
              >
                <Text className="font-extrabold">{line.speaker}: </Text>
                {line.text}
                {line.final ? "" : "…"}
              </Text>
            ))
          ) : (
            <Text className="text-white/60 text-sm italic">
              Listening — the other person's words will appear here in your language…
            </Text>
          )}
        </View>
      </View>

      {/* Bottom Section: Controls & Hangup Button */}
      <View className="px-6 items-center mt-auto">
        {/* Action Controls Row (Active Call only) */}
        {!isCalling && (
          <View className="flex-row items-center justify-around w-full max-w-xs mb-8">
            {/* Mute */}
            <View className="items-center">
              <Pressable
                onPress={toggleMute}
                className={`w-14 h-14 rounded-full items-center justify-center ${
                  isMuted ? "bg-white" : "bg-white/15"
                } active:opacity-70`}
              >
                <Ionicons
                  name={isMuted ? "mic-off" : "mic"}
                  size={24}
                  color={isMuted ? "#1D5BD8" : "#FFFFFF"}
                />
              </Pressable>
              <Text className="text-white/90 text-xs font-medium mt-2">
                {isMuted ? "Unmute" : "Mute"}
              </Text>
            </View>

            {/* Speaker */}
            <View className="items-center">
              <Pressable
                onPress={toggleSpeaker}
                className={`w-14 h-14 rounded-full items-center justify-center ${
                  isSpeaker ? "bg-white" : "bg-white/15"
                } active:opacity-70`}
              >
                <Ionicons
                  name={isSpeaker ? "volume-high" : "volume-medium-outline"}
                  size={24}
                  color={isSpeaker ? "#1D5BD8" : "#FFFFFF"}
                />
              </Pressable>
              <Text className="text-white/90 text-xs font-medium mt-2">Speaker</Text>
            </View>
          </View>
        )}

        {__DEV__ && (
          <Pressable
            onPress={handleDevTts}
            className="mb-4 bg-white/15 rounded-full px-4 py-2 active:opacity-70"
          >
            <Text className="text-white text-xs font-bold">Test TTS</Text>
          </Pressable>
        )}

        {/* End Call Button */}
        <View className="items-center">
          <Pressable
            onPress={handleHangup}
            accessibilityRole="button"
            accessibilityLabel="End call"
            hitSlop={12}
            className="w-18 h-18 w-[72px] h-[72px] rounded-full bg-[#EF4444] items-center justify-center shadow-lg active:scale-95"
          >
            <MaterialCommunityIcons
              name="phone-hangup"
              size={32}
              color="#FFFFFF"
            />
          </Pressable>
          <Text className="text-white/80 text-sm font-medium mt-2">End call</Text>
        </View>
      </View>

      {/* TTS status bubble: fixed label only, never the spoken text. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 90,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 999,
            elevation: 999,
          },
          { opacity },
        ]}
      >
        <View className="flex-row items-center rounded-full bg-[#1D6FEB] px-4 py-2">
          <ActivityIndicator size="small" color="#FFFFFF" />
          {bubble !== "idle" && (
            <Text className="text-white text-sm font-semibold ml-2">
              {BUBBLE_LABELS[bubble]}
            </Text>
          )}
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}