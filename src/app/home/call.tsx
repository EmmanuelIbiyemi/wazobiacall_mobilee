import { useEffect, useRef } from "react";
import { View } from "react-native";
import { router } from "expo-router";

import { useCall } from "../../components/call_context";
import CallScreen from "../../components/call_screen";

export default function CallRoute() {
  const { activeCall, elapsedSeconds, isConnected, callNotice, endCall } = useCall();
  const isNavigatingRef = useRef(false);

  // If activeCall becomes null externally (e.g. from notification hangup), navigate back smoothly
  useEffect(() => {
    if (!activeCall && !isNavigatingRef.current) {
      isNavigatingRef.current = true;
      router.replace("/home/recentcalls");
    }
  }, [activeCall]);

  const handleHangup = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    endCall();
    router.replace("/home/recentcalls");
  };

  if (!activeCall) {
    return <View className="flex-1 bg-[#1D5BD8]" />;
  }

  return (
    <CallScreen
      name={activeCall.name}
      number={activeCall.number}
      seconds={elapsedSeconds}
      connected={isConnected}
      notice={callNotice}
      onHangup={handleHangup}
    />
  );
}

