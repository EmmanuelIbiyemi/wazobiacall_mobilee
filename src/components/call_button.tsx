import React from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "./call_context";

type CallButtonProps = {
  number: string;
  name?: string;
  onPress?: (number: string) => void;
};

export default function CallButton({ number, name, onPress }: CallButtonProps) {
  const { activeCall, startCall } = useCall();
  const cleanedNumber = number.replace(/\s+/g, "");

  const handlePress = () => {
    onPress?.(cleanedNumber);

    // Only one call at a time: while a call is up, just return to that call.
    if (!activeCall) {
      startCall(name ?? "Unknown", cleanedNumber);
    }

    router.push("/home/call");
  };

  return (
    <Pressable
      onPress={handlePress}
      className="w-10 h-10 rounded-full bg-[#1D5BD8] items-center justify-center active:bg-blue-700 shadow-sm"
    >
      <Ionicons name="call" size={18} color="#FFFFFF" />
    </Pressable>
  );
}