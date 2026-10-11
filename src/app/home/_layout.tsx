import React from "react";
import { View, Pressable } from "react-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import ActiveCallBanner from "../../components/active_call_banner";
import "../../global.css";

export default function CallLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 10);

  return (
    <View className="flex-1 bg-white">
      <ActiveCallBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#2563EB",
          tabBarInactiveTintColor: "#64748B",
          tabBarButton: (props) => (
            <Pressable
              {...props}
              android_ripple={null}
              style={props.style}
            />
          ),
          tabBarStyle: {
            height: 54 + bottomInset,
            paddingBottom: bottomInset,
            paddingTop: 6,
            backgroundColor: "#FFFFFF",
            borderTopColor: "#F1F5F9",
            borderTopWidth: 1,
            elevation: 0,
            shadowOpacity: 0,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
          },
        }}
      >
        <Tabs.Screen
          name="recentcalls"
          options={{
            title: "Calls",
            tabBarIcon: ({ focused }) => (
              <View
                className={`px-110 py-1 rounded-full items-center justify-center ${
                  focused ? "bg-blue-50" : ""
                }`}
              >
                <Ionicons
                  name={focused ? "call" : "call-outline"}
                  size={20}
                  color={focused ? "#2563EB" : "#64748B"}
                />
              </View>
            ),
            tabBarStyle:{
              paddingBottom:20
            }
          }}
        />
        <Tabs.Screen
          name="contact"
          options={{
            title: "Contacts",
            tabBarIcon: ({ focused }) => (
              <View
                className={`px-110 py-1 rounded-full items-center justify-center ${
                  focused ? "bg-blue-50" : ""
                }`}
              >
                <Ionicons
                  name={focused ? "people" : "people-outline"}
                  size={20}
                  color={focused ? "#2563EB" : "#64748B"}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="detail"
          options={{
            href: null,
            tabBarStyle: { display: "none" },
          }}
        />
        <Tabs.Screen
          name="call"
          options={{
            href: null,
            tabBarStyle: { display: "none" },
          }}
        />
      </Tabs>
    </View>
  );
}
