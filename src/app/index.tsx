import { View, Text, ActivityIndicator, Image } from 'react-native'
import React, { useEffect } from 'react'
import { router } from 'expo-router'
import { loadAuthToken, getAuthToken, setAuthToken } from '../utils/endpoint'
import { getMe } from '../utils/auth'

const WAZOBIA_ICON = require('../../assets/images/mobileicon/wazobiaicon.png')

export default function Index() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadAuthToken();
        if (cancelled) return;

        // No token -> must sign in.
        if (!getAuthToken()) {
          router.replace("/(auth)/signin");
          return;
        }

        // Validate the token against /auth/me. Throws if unauthorized.
        await getMe();
        if (cancelled) return;

        router.replace("/home/recentcalls");
      } catch {
        // Invalid/expired token -> clear it and go back to login.
        setAuthToken(null);
        if (!cancelled) {
          router.replace("/(auth)/signin");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [])

  return (
    <View className='flex-1 bg-white justify-center items-center'>
      <Image source={WAZOBIA_ICON} className='w-32 h-32 rounded-3xl' resizeMode='cover' />
      <ActivityIndicator size="large" color="#2563EB" className='mt-6' />
      <Text className='font-semibold text-slate-600 mt-3'>Loading...</Text>
    </View>
  )
}