import React from "react";
import { View, Text, Pressable, StatusBar, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCall } from "../../components/call_context";

function getInitials(name: string): string {
  if (!name) return "AY";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase() || "AY";
}

function getFirstName(name: string): string {
  if (!name) return "Contact";
  const parts = name.trim().split(/\s+/);
  return parts[0] || name;
}

export default function CallDetailScreen() {
  const params = useLocalSearchParams<{
    name?: string;
    phone?: string;
    language?: string;
    type?: string;
  }>();

  const { startCall } = useCall();

  const name = params.name || "NOT REGISTERED";
  const phone = params.phone || "+234 812 345 6789";
  const language = params.language || "NULL";
  const callType = params.type || "Outgoing call";
  const initials = getInitials(name);
  const firstName = getFirstName(name);

  const handleMakeCall = () => {
    // No language step: STT uses each party's saved language, and what you say
    // is translated into the other party's language automatically.
    startCall(name, phone.replace(/\s+/g, ""));
    router.push("/home/call");
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View className="px-5 py-3 flex-row items-center border-b border-slate-100">
        <Pressable
          onPress={() => router.back()}
          className="p-2 -ml-2 rounded-full active:bg-slate-100"
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text className="text-slate-900 text-lg font-bold ml-2">
          Call details
        </Text>
      </View>

      <ScrollView className="flex-1 px-6 pt-8 pb-10">
        {/* Contact Avatar Circle */}
        <View className="items-center mb-4">
          <View className="w-24 h-24 rounded-full bg-blue-100 items-center justify-center mb-4">
            <Text className="text-[#2563EB] text-3xl font-bold tracking-wider">
              {initials}
            </Text>
          </View>

          {/* Contact Name */}
          <Text className="text-slate-900 text-3xl font-extrabold text-center">
            {name}
          </Text>

          {/* Phone Number */}
          <Text className="text-slate-500 text-base font-medium mt-1 text-center">
            {phone}
          </Text>

          {/* Language Badge */}
          <View className="mt-3 bg-blue-50 border border-blue-100 px-3.5 py-1.5 rounded-full flex-row items-center">
            <Text className="text-[#2563EB] text-xs font-black mr-1.5">文A</Text>
            <Text className="text-[#2563EB] text-xs font-semibold">
              Speaks {language}
            </Text>
          </View>
        </View>

        {/* Call Info Card */}
        <View className="mt-6 bg-slate-50 border border-slate-100 rounded-2xl p-4">
          <View className="flex-row items-center mb-2">
            <View className="w-8 h-8 rounded-full bg-blue-100 items-center justify-center mr-3">
              <Ionicons
                name={
                  callType.toLowerCase().includes("missed")
                    ? "call"
                    : "arrow-up-outline"
                }
                size={16}
                color="#2563EB"
              />
            </View>
            <View className="flex-1">
              <Text className="text-slate-800 text-sm font-bold">
                {callType}
              </Text>
              <Text className="text-slate-500 text-xs mt-0.5">
                Live speech translation enabled
              </Text>
            </View>
          </View>

          <View className="pt-3 border-t border-slate-200/60 mt-2">
            <Text className="text-slate-500 text-xs font-medium">
              English ↔ {language} · Live translation
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Call Button at Bottom */}
      <View className="px-6 pb-6 pt-3 border-t border-slate-100">
        <Pressable
          onPress={handleMakeCall}
          className="w-full py-4 rounded-2xl bg-[#2563EB] flex-row items-center justify-center shadow-md active:bg-blue-700"
        >
          <Ionicons name="call" size={18} color="#FFFFFF" className="mr-2" />
          <Text className="text-white text-base font-bold ml-2">
            Call {firstName}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
