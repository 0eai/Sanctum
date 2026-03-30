import { createContext, useContext } from 'react';
import { useWebRTC } from '../apps/secureshare/hooks/useWebRTC';

const WebRTCContext = createContext(null);

export function WebRTCProvider({ user, cryptoKey, children }) {
    const webrtc = useWebRTC(user?.uid, cryptoKey);
    return <WebRTCContext.Provider value={webrtc}>{children}</WebRTCContext.Provider>;
}

export const useWebRTCContext = () => useContext(WebRTCContext);
