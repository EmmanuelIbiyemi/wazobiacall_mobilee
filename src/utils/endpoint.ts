import axios from "axios";
import * as SecureStore from "expo-secure-store";

// Base URL of the Wazobia backend.
export const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  "https://skied-custody-shrouded.ngrok-free.dev";

const TOKEN_KEY = "wazobia_auth_token";

// Shared axios client used by every backend call.
export const api = axios.create({
  baseURL: BACKEND_URL,
  headers: { "Content-Type": "application/json" },
});

// In-memory JWT received from the auth endpoints under the "token" key.
let authToken: string | null = null;

type AuthTokenListener = (token: string | null) => void;
const authTokenListeners = new Set<AuthTokenListener>();

// Set the auth token in memory and persist it so refreshes keep the session.
export const setAuthToken = (token: string | null) => {
  authToken = token;
  void (async () => {
    try {
      if (token) {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch (error) {
      console.warn("Could not persist auth token:", error);
    }
  })();
  authTokenListeners.forEach((listener) => listener(token));
};

export const getAuthToken = () => authToken;

// Load a previously persisted token (call once at startup before making calls).
export const loadAuthToken = async (): Promise<string | null> => {
  if (authToken) return authToken;
  try {
    authToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    console.warn("Could not load persisted auth token:", error);
    authToken = null;
  }
  authTokenListeners.forEach((listener) => listener(authToken));
  return authToken;
};

// Subscribe to auth token changes (e.g. reconnect signalling after sign-in).
export const onAuthTokenChange = (listener: AuthTokenListener) => {
  authTokenListeners.add(listener);
  return () => {
    authTokenListeners.delete(listener);
  };
};

// Attach the bearer token to every request automatically once signed in.
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});
