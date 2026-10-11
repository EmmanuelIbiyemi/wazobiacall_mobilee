import React, { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type IncomingCallBannerProps = {
  name: string;
  number: string;
  onAnswer: () => void;
  onDecline: () => void;
};

export default function IncomingCallBanner({
  name,
  number,
  onAnswer,
  onDecline,
}: IncomingCallBannerProps) {
  const insets = useSafeAreaInsets();
  // Start off-screen (above the top edge), then slide down.
  const translateY = useRef(new Animated.Value(-400)).current;
  const contentHeightRef = useRef(120);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      friction: 8,
      tension: 70,
    }).start();
  }, [translateY]);

  const displayName = name && name.trim() ? name : "Incoming call";

  const handleDecline = () => {
    if (declining) return;
    setDeclining(true);
    const distance = contentHeightRef.current + insets.top + 24;
    Animated.timing(translateY, {
      toValue: -distance,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDecline();
    });
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.outer, { paddingTop: insets.top + 8, transform: [{ translateY }] }]}
    >
      <View
        onLayout={(e) => {
          contentHeightRef.current = e.nativeEvent.layout.height;
        }}
        className="bg-[#1D5BD8] flex-row items-center"
        style={styles.card}
      >
        {/* Left: caller info */}
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-10 h-10 rounded-full bg-white/20 items-center justify-center mr-3">
            <Ionicons name="call" size={18} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-white font-bold text-base" numberOfLines={1}>
              {displayName}
            </Text>
            <Text className="text-blue-100 text-sm mt-0.5" numberOfLines={1}>
              {number}
            </Text>
          </View>
        </View>

        {/* Right: Answer / Decline buttons */}
        <View className="flex-row items-center">
          <Pressable
            onPress={onAnswer}
            className="bg-emerald-500 active:bg-emerald-600 rounded-xl px-3 py-2.5 flex-row items-center justify-center mr-2"
          >
            <Ionicons name="call" size={15} color="#FFFFFF" />
            <Text className="text-white text-xs font-bold ml-1">Answer</Text>
          </Pressable>
          <Pressable
            onPress={handleDecline}
            className="bg-red-500 active:bg-red-600 rounded-xl px-3 py-2.5 flex-row items-center justify-center"
          >
            <Ionicons
              name="call"
              size={15}
              color="#FFFFFF"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
            <Text className="text-white text-xs font-bold ml-1">Decline</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  card: {
    marginHorizontal: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
