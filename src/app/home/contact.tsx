import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  PermissionsAndroid,
  Platform,
  Pressable,
  StatusBar,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ProfileSheet from "../../components/profile_sheet";

type ContactItem = {
  id: string;
  name: string;
  phone: string;
  language: string;
};

const DEFAULT_CONTACTS: ContactItem[] = [
  {
    id: "1",
    name: "Demo Amina Yusuf",
    phone: "+234 812 345 6789",
    language: "Hausa",
  },
  {
    id: "2",
    name: "Demo Bisi Adebayo",
    phone: "+234 813 987 6543",
    language: "Yoruba",
  },
  {
    id: "3",
    name: "Demo Chinedu Okafor",
    phone: "+234 802 123 4567",
    language: "Igbo",
  },
  {
    id: "4",
    name: "Demo Emeka Obi",
    phone: "+234 809 555 4321",
    language: "English",
  },
  {
    id: "5",
    name: "Demo Sade Balogun",
    phone: "+234 805 777 8899",
    language: "Yoruba",
  },
  {
    id: "6",
    name: "Demo Zainab Musa",
    phone: "+234 818 222 3344",
    language: "Hausa",
  },
];

function getInitials(name: string): string {
  if (!name) return "AY";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase() || "AY";
}

export default function ContactScreen() {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  const loadContacts = useCallback(async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_CONTACTS
        );

        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          const mod: any = await import("react-native-contacts");
          const getAllFn =
            mod.getAllWithoutPhotos ??
            mod.default?.getAllWithoutPhotos ??
            mod.getAll ??
            mod.default?.getAll;

          if (typeof getAllFn === "function") {
            const raw = await getAllFn();

            if (raw && raw.length > 0) {
              const formatted: ContactItem[] = raw
                .filter(
                  (c: any) =>
                    c &&
                    (c.displayName ||
                      c.givenName ||
                      c.familyName ||
                      (c.phoneNumbers && c.phoneNumbers.length > 0))
                )
                .map((c: any, idx: number) => ({
                  id: c.recordID || String(idx),
                  name:
                    c.displayName ||
                    [c.givenName, c.familyName]
                      .filter(Boolean)
                      .join(" ")
                      .trim() ||
                    "Unknown",
                  phone:
                    (c.phoneNumbers ?? [])
                      .map((p: any) => p.number)
                      .filter(Boolean)[0] || "",
                  language: "English",
                }));

              if (formatted.length > 0) {
                setContacts(formatted);
                return;
              }
            }
          }
        }
      } catch (err) {
        console.warn("Could not load native contacts:", err);
      }
    }
    setContacts(DEFAULT_CONTACTS);
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.phone.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const handleOpenDetail = (item: ContactItem) => {
    router.push({
      pathname: "/home/detail",
      params: {
        name: item.name,
        phone: item.phone,
        language: item.language,
      },
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View className="px-6 pt-3 pb-3 flex-row items-center justify-between">
        <Text className="text-slate-900 text-3xl font-extrabold tracking-tight">
          Contacts
        </Text>
        {/* Profile Avatar Icon */}
        <Pressable
          onPress={() => setShowProfile(true)}
          className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 items-center justify-center active:bg-blue-100"
        >
          <Ionicons name="person" size={18} color="#2563EB" />
        </Pressable>
      </View>

      {/* Search Input Bar */}
      <View className="px-6 pb-4">
        <View className="flex-row items-center bg-slate-100 rounded-xl px-3.5 py-2.5">
          <Ionicons name="search" size={18} color="#94A3B8" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search name or number"
            placeholderTextColor="#94A3B8"
            className="flex-1 ml-2.5 text-slate-800 text-sm font-medium p-0"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color="#94A3B8" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Contacts Count */}
      <View className="px-6 pb-2">
        <Text className="text-slate-400 text-xs font-bold tracking-wider uppercase">
          {filteredContacts.length} CONTACTS
        </Text>
      </View>

      {/* Contact List */}
      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const initials = getInitials(item.name);
          return (
            <Pressable
              onPress={() => handleOpenDetail(item)}
              className="py-3.5 border-b border-slate-100 flex-row items-center justify-between active:bg-slate-50"
            >
              <View className="flex-row items-center flex-1 mr-3">
                {/* Initials Avatar */}
                <View className="w-12 h-12 rounded-full bg-blue-100 items-center justify-center mr-3.5">
                  <Text className="text-[#2563EB] text-sm font-bold">
                    {initials}
                  </Text>
                </View>

                {/* Name & Language */}
                <View className="flex-1">
                  <Text
                    className="text-slate-900 text-base font-bold"
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text className="text-slate-500 text-xs mt-0.5 font-medium">
                    Speaks {item.language}
                  </Text>
                </View>
              </View>

              {/* Chevron > */}
              <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
            </Pressable>
          );
        }}
      />

      <ProfileSheet
        visible={showProfile}
        onClose={() => setShowProfile(false)}
      />
    </SafeAreaView>
  );
}