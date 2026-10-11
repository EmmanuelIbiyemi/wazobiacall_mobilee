import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  getMe,
  updatePreferredLanguage,
  type UserProfile,
} from "../utils/auth";

// Languages supported by the backend call/STT pipeline.
const PREFERRED_LANGUAGES = [
  "english",
  "yoruba",
  "igbo",
  "hausa",
  "nigerian pidgin",
];

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

type ProfileSheetProps = {
  visible: boolean;
  onClose: () => void;
};

/**
 * Bottom sheet that shows the signed-in user's email, phone number and
 * preferred language, and lets them change the language for calls.
 */
export default function ProfileSheet({ visible, onClose }: ProfileSheetProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedLang, setSelectedLang] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Pull fresh details from /auth/me each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);

    getMe()
      .then((me) => {
        if (cancelled) return;
        setProfile(me);
        setSelectedLang((me.prefer_lang || "english").toLowerCase());
      })
      .catch((error) => console.warn("Could not load profile:", error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleUpdateLanguage = useCallback(async () => {
    if (!selectedLang || saving) return;
    setSaving(true);
    try {
      const updated = await updatePreferredLanguage(selectedLang);
      const preferLang = updated.prefer_lang || selectedLang;
      setProfile((prev) => (prev ? { ...prev, prefer_lang: preferLang } : prev));
      console.log("[profile] preferred language updated:", preferLang);
      onClose();
    } catch (error) {
      console.warn("Could not update preferred language:", error);
    } finally {
      setSaving(false);
    }
  }, [selectedLang, saving, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable
          className="bg-white rounded-t-3xl px-6 pt-4 pb-6"
          style={{ height: "35%", minHeight: 248 }}
          onPress={() => {}}
        >
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : (
            <>
              {/* Email — unedited, at the top */}
              <View className="mb-3">
                <Text className="text-slate-400 text-[11px] font-semibold uppercase">
                  Email
                </Text>
                <Text
                  className="text-slate-900 text-base font-bold mt-0.5"
                  numberOfLines={1}
                >
                  {profile?.email || "—"}
                </Text>
              </View>

              {/* Phone number & preferred language, side by side */}
              <View className="flex-row items-center mb-3">
                <View className="flex-1 mr-3">
                  <Text className="text-slate-400 text-[11px] font-semibold uppercase">
                    Phone number
                  </Text>
                  <Text
                    className="text-slate-900 text-sm font-semibold mt-0.5"
                    numberOfLines={1}
                  >
                    {profile?.phone_number || "—"}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-slate-400 text-[11px] font-semibold uppercase">
                    Preferred language
                  </Text>
                  <Text className="text-slate-900 text-sm font-semibold mt-0.5">
                    {profile?.prefer_lang ? titleCase(profile.prefer_lang) : "—"}
                  </Text>
                </View>
              </View>

              {/* Language options */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="flex-grow-0"
                contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              >
                {PREFERRED_LANGUAGES.map((lang) => {
                  const active = selectedLang === lang;
                  return (
                    <Pressable
                      key={lang}
                      onPress={() => setSelectedLang(lang)}
                      className={`px-3 py-1.5 rounded-full border ${
                        active
                          ? "bg-blue-50 border-blue-200"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          active ? "text-[#2563EB]" : "text-slate-600"
                        }`}
                      >
                        {titleCase(lang)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Update language */}
              <Pressable
                onPress={handleUpdateLanguage}
                disabled={saving}
                className={`mt-10 h-12 rounded-2xl bg-[#2563EB] items-center justify-center active:bg-blue-700 ${
                  saving ? "opacity-60" : ""
                }`}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text className="text-white text-base font-bold">
                    Update Language
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
