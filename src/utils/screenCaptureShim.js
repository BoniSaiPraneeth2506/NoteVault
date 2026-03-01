// No-op shim for expo-screen-capture used in Expo Go (development).
// EAS builds get the real native module via metro.config.js alias.
export const preventScreenCaptureAsync = async () => {};
export const allowScreenCaptureAsync = async () => {};
export const usePreventScreenCapture = () => {};
export default { preventScreenCaptureAsync, allowScreenCaptureAsync, usePreventScreenCapture };
