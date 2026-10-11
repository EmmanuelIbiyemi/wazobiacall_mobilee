import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getMe, requestVerificationCode, verifyCode } from "../../utils/auth";

export default function VerifyScreen() {
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeStatus, setCodeStatus] = useState("Sending verification code...");
  const [countdown, setCountdown] = useState(24);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((user) => {
        if (cancelled) return;
        setUsername(user.username || "");
        setPhoneNumber(user.phone_number || "");
      })
      .catch(() => {});
    requestVerificationCode()
      .then((response) => {
        if (!cancelled) {
          setCodeStatus(response.message || "Verification code sent by SMS.");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCodeStatus("");
          setError(
            err instanceof Error
              ? err.message
              : "Could not send the verification code."
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleVerify = async () => {
    if (!verificationCode.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await verifyCode(verificationCode.trim());
      if (res.status === "success") {
        router.replace("/home/recentcalls");
      } else {
        setError(res.message || "Invalid verification code.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
          keyboardShouldPersistTaps="handled"
          className="px-6 pt-4 pb-8"
        >
          <View>
            {/* Header with Back button */}
            <Pressable
              onPress={() => router.back()}
              className="flex-row items-center mb-6 py-2"
            >
              <Ionicons name="arrow-back" size={22} color="#1E293B" />
              <Text className="text-slate-800 text-lg font-bold ml-2">
                Sign in
              </Text>
            </Pressable>

            {/* Title & Subtitle */}
            <Text className="text-slate-900 text-3xl font-extrabold tracking-tight mb-2">
              Welcome back{username ? `, ${username}` : ""}.
            </Text>
            <Text className="text-slate-500 text-sm leading-relaxed mb-8">
              Verify your phone number to finish setting up your account.
            </Text>

            {/* Phone Number Field */}
            <View className="mb-4">
              <Text className="text-slate-700 text-xs font-semibold mb-2">
                Phone number
              </Text>
              <TextInput
                value={phoneNumber}
                editable={false}
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-slate-800 text-base bg-slate-50"
              />
            </View>

            {/* Verification Sent Notice */}
            <View className="flex-row items-center mb-4">
              <Ionicons
                name={codeStatus ? "checkmark-circle-outline" : "alert-circle-outline"}
                size={16}
                color={codeStatus ? "#10B981" : "#DC2626"}
              />
              <Text className="text-slate-500 text-xs ml-1.5 font-medium">
                {codeStatus || "Verification code delivery failed."}
              </Text>
            </View>

            {/* Verification Code Field */}
            <View className="mb-4">
              <Text className="text-slate-700 text-xs font-semibold mb-2">
                Verification code
              </Text>
              <TextInput
                value={verificationCode}
                onChangeText={setVerificationCode}
                keyboardType="number-pad"
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-slate-800 text-base tracking-widest bg-white"
                placeholder="000 000"
                placeholderTextColor="#94A3B8"
                maxLength={7}
              />
            </View>

            {/* Resend Code Link */}
            <Pressable
              onPress={async () => {
                if (countdown > 0) return;
                setCountdown(30);
                setError("");
                setCodeStatus("Sending verification code...");
                try {
                  const response = await requestVerificationCode();
                  setCodeStatus(response.message || "Verification code sent by SMS.");
                } catch (err) {
                  setCodeStatus("");
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Could not send the verification code."
                  );
                }
              }}
              className="self-start py-1"
            >
              <Text className="text-[#2563EB] text-xs font-semibold">
                {countdown > 0
                  ? `Resend code in 00:${String(countdown).padStart(2, "0")}`
                  : "Resend code"}
              </Text>
            </Pressable>

            {/* Error message */}
            {error ? (
              <Text className="text-red-600 text-xs font-medium mt-4">
                {error}
              </Text>
            ) : null}
          </View>

          {/* Bottom Actions */}
          <View className="mt-8">
            <Pressable
              onPress={handleVerify}
              disabled={isLoading}
              className="w-full h-13 py-3.5 rounded-xl bg-[#2563EB] items-center justify-center shadow-sm active:bg-blue-700"
            >
              {isLoading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-white font-bold text-base ml-2">
                    Verifying...
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center">
                  <Ionicons name="checkmark" size={18} color="#FFFFFF" />
                  <Text className="text-white font-bold text-base ml-1.5">
                    Verify
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Create account link */}
            <Pressable
              onPress={() => router.push("/(auth)/signup")}
              className="items-center mt-5 py-2"
            >
              <Text className="text-[#2563EB] text-sm font-semibold">
                New here? Create an account
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
