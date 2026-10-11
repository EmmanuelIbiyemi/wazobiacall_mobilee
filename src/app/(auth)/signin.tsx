import React, { useState } from "react";
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
import { signin } from "../../utils/auth";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = email.trim().length > 0 && password.length > 0;

  const handleSignIn = async () => {
    if (!canSubmit) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await signin({
        email: email.trim(),
        password,
      });
      if (res.token && res.phone_verified === true) {
        router.replace("/home/recentcalls");
      } else if (res.token && res.phone_verified !== true) {
        router.replace("/(auth)/verify");
      } else {
        setError(res.error || res.message || res.detail || "Unable to sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in.");
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
            {/* Header */}
            <View className="flex-row items-center mb-6 py-2">
              <Text className="text-slate-800 text-lg font-bold">Sign in</Text>
            </View>

            {/* Title & Subtitle */}
            <Text className="text-slate-900 text-3xl font-extrabold tracking-tight mb-2">
              Welcome to Wazobia Call
            </Text>
            <Text className="text-slate-500 text-sm leading-relaxed mb-8">
              Enter your email and password to continue.
            </Text>

            {/* Email Field */}
            <View className="mb-4">
              <Text className="text-slate-700 text-xs font-semibold mb-2">
                Email
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="w-full h-12 px-4 border border-slate-200 rounded-xl text-slate-800 text-base bg-white"
                placeholder="you@example.com"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Password Field */}
            <View className="mb-4">
              <Text className="text-slate-700 text-xs font-semibold mb-2">
                Password
              </Text>
              <View className="relative">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  className="w-full h-12 px-4 pr-12 border border-slate-200 rounded-xl text-slate-800 text-base bg-white"
                  placeholder="Enter your password"
                  placeholderTextColor="#94A3B8"
                />
                <Pressable
                  onPress={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-0 bottom-0 justify-center"
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color="#94A3B8"
                  />
                </Pressable>
              </View>
            </View>

            {/* Error message */}
            {error ? (
              <Text className="text-red-600 text-xs font-medium mb-4">
                {error}
              </Text>
            ) : null}
          </View>

          {/* Bottom Actions */}
          <View className="mt-8">
            <Pressable
              onPress={handleSignIn}
              disabled={isLoading || !canSubmit}
              className={`w-full h-13 py-3.5 rounded-xl bg-[#2563EB] items-center justify-center shadow-sm active:bg-blue-700 ${
                !canSubmit ? "opacity-60" : ""
              }`}
            >
              {isLoading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text className="text-white font-bold text-base ml-2">
                    Signing in...
                  </Text>
                </View>
              ) : (
                <Text className="text-white font-bold text-base">Sign in</Text>
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