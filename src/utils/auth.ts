import axios from "axios";
import { api, setAuthToken } from "./endpoint";

export interface SignupPayload {
  username: string;
  phone_number: string;
  email: string;
  password: string;
}

export interface SigninPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  status?: string;
  message?: string;
  token?: string;
  user_id?: string;
  account_id?: string;
  phone_verified?: boolean;
  prefer_lang?: string;
  error?: string;
  detail?: string;
}

export interface UserProfile {
  status?: string;
  user_id?: string;
  username?: string;
  email?: string;
  phone_number?: string;
  verified_number?: boolean;
  prefer_lang?: string;
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = unwrapResponse(error.response?.data);
    if (body) {
      return body.message || body.error || body.detail || error.message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

// FastAPI returns some auth responses as a tuple `(payload, status)`, which
// gets serialized as a JSON array like `[{...}, 200]`. Normalize to the
// payload object so the rest of the code can read fields off `data` directly.
function unwrapResponse(data: unknown): AuthResponse {
  if (Array.isArray(data)) {
    return (data[0] as AuthResponse) ?? {};
  }
  return data as AuthResponse;
}

// POST /auth/signup
export async function signup(payload: SignupPayload): Promise<AuthResponse> {
  try {
    const { data } = await api.post("/auth/signup", payload);
    const body = unwrapResponse(data);
    if (body.token) {
      setAuthToken(body.token);
    }
    return body;
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

// POST /auth/signin
export async function signin(payload: SigninPayload): Promise<AuthResponse> {
  try {
    const { data } = await api.post("/auth/signin", payload);
    const body = unwrapResponse(data);
    if (body.token) {
      setAuthToken(body.token);
    }
    return body;
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

// GET /auth/me — returns the signed-in user's profile (username, phone number).
export async function getMe(): Promise<UserProfile> {
  try {
    const { data } = await api.get("/auth/me");
    return unwrapResponse(data) as UserProfile;
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

// POST /auth/prefer_lang — updates the signed-in user's preferred language.
export async function updatePreferredLanguage(
  preferLang: string
): Promise<UserProfile> {
  try {
    const { data } = await api.post("/auth/prefer_lang", {
      prefer_lang: preferLang,
    });
    return unwrapResponse(data) as UserProfile;
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

// POST /auth/verify-number (no code) — sends a verification code by SMS.
export async function requestVerificationCode(): Promise<AuthResponse> {
  try {
    const { data } = await api.post("/auth/verify-number", {});
    return unwrapResponse(data);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

// POST /auth/verify-number (with code) — verifies the submitted code.
export async function verifyCode(code: string): Promise<AuthResponse> {
  try {
    const { data } = await api.post("/auth/verify-number", { code });
    return unwrapResponse(data);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}
