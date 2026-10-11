import React from "react";
import { View, Text, Pressable } from "react-native";
import { router, usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "./call_context";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${pad(minutes)}:${pad(seconds)}`;
}

export default function ActiveCallBanner() {
  const { activeCall, elapsedSeconds, endCall } = useCall();
  const pathname = usePathname();

  // Do not show the banner if there's no active call or if the user is already on the call screen
  if (!activeCall || pathname === "/home/call") {
    return null;
  }

  return (
    <View className="px-4 pt-2 pb-1 bg-transparent">
      <Pressable
        onPress={() => router.push("/home/call")}
        className="bg-blue-600 rounded-2xl px-4 py-3 flex-row items-center justify-between shadow-lg shadow-blue-900/30 border border-blue-400/30"
      >
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3">
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center">
              <View className="w-2 h-2 rounded-full bg-emerald-400 mr-2" />
              <Text className="text-white font-bold text-sm" numberOfLines={1}>
                {activeCall.name}
              </Text>
            </View>
            <Text className="text-blue-100 text-xs mt-0.5">
              Call in progress • {formatDuration(elapsedSeconds)}
            </Text>
          </View>
        </View>

        {/* Hang Up Action Button right in the notification/banner */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            endCall();
          }}
          className="bg-red-500 active:bg-red-600 px-3 py-2 rounded-xl flex-row items-center justify-center shadow-sm"
        >
          <Ionicons name="call" size={14} color="#FFFFFF" style={{ transform: [{ rotate: "135deg" }] }} />
          <Text className="text-white text-xs font-bold ml-1.5">Hang up</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}
