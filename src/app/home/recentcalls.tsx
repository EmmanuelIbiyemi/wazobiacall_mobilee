import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StatusBar,
  FlatList,
  Pressable,
  Platform,
  PermissionsAndroid,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../../components/call_context";
import { useIncomingCall } from "../../components/incoming_call_context";
import ProfileSheet from "../../components/profile_sheet";

type CallLogEntry = {
  id: string;
  name: string;
  number: string;
  language?: string;
};

function getInitials(name: string): string {
  if (!name) return "AY";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase() || "AY";
}

const FALLBACK_LOGS: CallLogEntry[] = [
  {
    id: "1",
    name: "Demo Amina Yusuf",
    number: "+234 812 345 6789",
    language: "Hausa",
  },
  {
    id: "2",
    name: "Demo Chinedu Okafor",
    number: "+234 802 123 4567",
    language: "Igbo",
  },
  {
    id: "3",
    name: "Demo Bisi Adebayo",
    number: "+234 813 987 6543",
    language: "Yoruba",
  },
  {
    id: "4",
    name: "Demo Emeka Obi",
    number: "+234 809 555 4321",
    language: "English",
  },
];

const KEYPAD_KEYS = [
  { digit: "1", letters: "" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*", letters: "" },
  { digit: "0", letters: "+" },
  { digit: "#", letters: "" },
];

export default function RecentCallsScreen() {
  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [showDialer, setShowDialer] = useState(false);
  const [dialedNumber, setDialedNumber] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const { startCall, livekitState } = useCall();
  const { signallingState } = useIncomingCall();

  // "Reconnecting" wins over "Connected": show it whenever EITHER the
  // signalling socket or the LiveKit audio connection is trying to recover.
  const connectionState =
    signallingState === "reconnecting" || livekitState === "reconnecting"
      ? "reconnecting"
      : signallingState === "connected" || livekitState === "connected"
        ? "connected"
        : null;

  // Load real call logs from device if available, without displaying date records
  const loadLogs = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CALL_LOG
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          const { default: CallLogs } = await import("react-native-call-log");
          const logs = await CallLogs.load(30);

          if (logs && logs.length > 0) {
            const formatted: CallLogEntry[] = logs.map((item, idx) => ({
              id: item.id || String(idx),
              name: item.name || item.formattedNumber || item.phoneNumber || "Unknown",
              number: item.formattedNumber || item.phoneNumber || "",
              language: "Hausa",
            }));
            setCalls(formatted);
            return;
          }
        }
      } catch (e) {
        console.warn("Could not load native call logs, using defaults:", e);
      }
    }
    // If on iOS, web, or permissions not granted, show default calls
    setCalls(FALLBACK_LOGS);
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Match contact for the dialer
  const matchedContact = useMemo(() => {
    if (!dialedNumber) return null;
    const cleanDialed = dialedNumber.replace(/\D/g, "");
    if (!cleanDialed) return null;
    return calls.find((c) => {
      const cleanNum = c.number.replace(/\D/g, "");
      return cleanNum.includes(cleanDialed) || cleanDialed.includes(cleanNum);
    });
  }, [dialedNumber, calls]);

  const handleOpenDetail = (item: CallLogEntry) => {
    router.push({
      pathname: "/home/detail",
      params: {
        name: item.name,
        phone: item.number,
        language: item.language || "Hausa",
      },
    });
  };

  const handleKeypadPress = (digit: string) => {
    setDialedNumber((prev) => prev + digit);
  };

  const handleKeypadLongPress = (digit: string) => {
    if (digit === "0") {
      setDialedNumber((prev) => prev + "+");
    }
  };

  const handleDeleteDigit = () => {
    setDialedNumber((prev) => prev.slice(0, -1));
  };

  const handleClearAllDigits = () => {
    setDialedNumber("");
  };

  const handleMakeCall = () => {
    if (!dialedNumber.trim()) return;
    const callerName = matchedContact?.name || "Unknown";
    const cleanedNumber = dialedNumber.trim();
    setShowDialer(false);
    // No language step: STT uses each party's saved language, and what you say
    // is translated into the other party's language automatically.
    startCall(callerName, cleanedNumber);
    router.push("/home/call");
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View className="px-6 pt-3 pb-4 flex-row items-center justify-between">
        <Text className="text-slate-900 text-3xl font-extrabold tracking-tight">
          Calls
        </Text>
        <View className="flex-row items-center">
          {/* Keypad Quick Button */}
          <Pressable
            onPress={() => setShowDialer(true)}
            className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 items-center justify-center mr-2 active:bg-blue-100"
          >
            <Ionicons name="keypad" size={18} color="#2563EB" />
          </Pressable>

          {/* Profile Avatar Icon */}
          <Pressable
            onPress={() => setShowProfile(true)}
            className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 items-center justify-center active:bg-blue-100"
          >
            <Ionicons name="person" size={18} color="#2563EB" />
          </Pressable>
        </View>
      </View>

      {connectionState ? (
        <View className="px-6 pb-2">
          <View
            className="self-start px-4 py-1 rounded-full"
            style={{
              backgroundColor:
                connectionState === "connected" ? "#10B981" : "#F59E0B",
            }}
          >
            <Text className="text-white text-xs font-bold">
              {connectionState === "connected" ? "Connected" : "Reconnecting..."}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Call List */}
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 90 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const initials = getInitials(item.name);
          return (
            <Pressable
              onPress={() => handleOpenDetail(item)}
              className="py-3.5 border-b border-slate-100 flex-row items-center justify-between active:bg-slate-50"
            >
              <View className="flex-row items-center flex-1 mr-3">
                {/* Avatar with initials */}
                <View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center mr-3.5">
                  <Text className="text-[#2563EB] text-sm font-bold">
                    {initials}
                  </Text>
                </View>

                {/* Name & Phone Number Only */}
                <View className="flex-1">
                  <Text
                    className="text-slate-900 text-base font-bold"
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View className="flex-row items-center mt-0.5">
                    <Ionicons
                      name="call-outline"
                      size={12}
                      color="#64748B"
                      style={{ marginRight: 4 }}
                    />
                    <Text className="text-slate-500 text-xs font-medium">
                      {item.number}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Chevron > (More) */}
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          );
        }}
      />

      {/* Floating Dial a Number Button */}
      <View className="absolute bottom-6 left-0 right-0 items-center px-6">
        <Pressable
          onPress={() => setShowDialer(true)}
          className="w-full max-w-xs h-13 py-3.5 rounded-2xl bg-[#2563EB] flex-row items-center justify-center shadow-lg shadow-blue-500/30 active:bg-blue-700"
        >
          <Ionicons name="grid" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text className="text-white text-base font-bold">
            Dial a number
          </Text>
        </Pressable>
      </View>

      {/* Calls · Dial Keypad Screen Modal (Matches Design Exactly) */}
      <Modal
        visible={showDialer}
        animationType="slide"
        onRequestClose={() => setShowDialer(false)}
      >
        <SafeAreaView className="flex-1 bg-white justify-between pb-6">
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

          {/* Keypad Header */}
          <View className="px-6 pt-3 pb-2 flex-row items-center">
            <Pressable
              onPress={() => setShowDialer(false)}
              className="p-2 -ml-2 rounded-full active:bg-slate-100"
            >
              <Ionicons name="arrow-back" size={24} color="#0F172A" />
            </Pressable>
            <Text className="text-slate-900 text-xl font-bold ml-2">
              Dial a number
            </Text>
          </View>

          {/* Dialed Number & Contact Match Area */}
          <View className="items-center px-6 py-4 min-h-[96px] justify-center">
            <Text
              className="text-slate-900 text-3xl font-extrabold tracking-wide text-center"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {dialedNumber || " "}
            </Text>
            {matchedContact ? (
              <Text className="text-slate-500 text-sm font-medium mt-1 text-center">
                {matchedContact.name} · {matchedContact.language || "Hausa"}
              </Text>
            ) : dialedNumber ? (
              <Text className="text-slate-400 text-xs font-medium mt-1 text-center">
                New number
              </Text>
            ) : null}
          </View>

          {/* Keypad 3x4 Grid */}
          <View className="items-center px-4">
            <View className="flex-row flex-wrap justify-center w-[300px]">
              {KEYPAD_KEYS.map((item) => (
                <View
                  key={item.digit}
                  className="w-[100px] h-[86px] items-center justify-center"
                >
                  <Pressable
                    onPress={() => handleKeypadPress(item.digit)}
                    onLongPress={() => handleKeypadLongPress(item.digit)}
                    delayLongPress={400}
                    className="w-19 h-19 w-[76px] h-[76px] rounded-full bg-[#F3F6FD] items-center justify-center active:bg-blue-100"
                  >
                    <Text className="text-slate-900 text-3xl font-semibold leading-tight">
                      {item.digit}
                    </Text>
                    {item.letters ? (
                      <Text className="text-slate-400 text-[10px] font-bold tracking-widest uppercase -mt-0.5">
                        {item.letters}
                      </Text>
                    ) : null}
                  </Pressable>
                </View>
              ))}
            </View>
          </View>

          {/* Bottom Call & Backspace Controls */}
          <View className="px-8 mt-2">
            <View className="flex-row items-center justify-between w-full max-w-[300px] self-center">
              {/* Left Spacer for balance */}
              <View className="w-14 h-14" />

              {/* Center Call Button */}
              <Pressable
                onPress={handleMakeCall}
                disabled={!dialedNumber}
                className={`w-18 h-18 w-[72px] h-[72px] rounded-full bg-[#2563EB] items-center justify-center shadow-lg shadow-blue-500/30 active:bg-blue-700 ${
                  !dialedNumber ? "opacity-60" : ""
                }`}
              >
                <Ionicons name="call" size={30} color="#FFFFFF" />
              </Pressable>

              {/* Right Backspace Button */}
              <View className="w-14 h-14 items-center justify-center">
                {dialedNumber ? (
                  <Pressable
                    onPress={handleDeleteDigit}
                    onLongPress={handleClearAllDigits}
                    className="w-12 h-12 rounded-full items-center justify-center active:bg-slate-100"
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={26}
                      color="#64748B"
                    />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {/* Hint */}
            <Text className="text-slate-400 text-xs text-center mt-4 font-medium">
              Press and hold 0 for +
            </Text>
          </View>
        </SafeAreaView>
      </Modal>

      <ProfileSheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </SafeAreaView>
  );
}