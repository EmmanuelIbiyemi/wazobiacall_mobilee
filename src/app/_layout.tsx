import { Stack } from "expo-router";
import "@/global.css"
import { CallProvider } from "@/components/call_context";
import { IncomingCallProvider } from "@/components/incoming_call_context";


export default function RootLayout() {
  return (
    <CallProvider>
      <IncomingCallProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="home" options={{ headerShown: false }} />
        </Stack>
      </IncomingCallProvider>
    </CallProvider>
  );
}
