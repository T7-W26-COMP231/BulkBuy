import { useEffect, useState } from "react";
import { getSocket } from "./socket";

export function useSocketEvent(eventName) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const handler = (payload) => {
      setData(payload);
    };
    const socket = getSocket();
    if (!socket) return;

    // 1. Attach listener
    socket.on(eventName, handler);

    // 2. Cleanup: Remove listener when component dies
    return () => {
      socket.off(eventName, handler);
    };
  }, [eventName]);

  return data;
}
