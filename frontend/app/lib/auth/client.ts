export type AuthUser = { id: string; email?: string | null };

export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthAPI = {
  isAuthenticated: () => boolean;
  user: () => AuthUser | null;
  /** Mock: argumentum nélkül is; session: kötelező email + jelszó. */
  login: (creds?: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const STORAGE_KEY = "questell_auth_v1";

type StoredSession = {
  user: AuthUser;
  token: string;
};

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const user = o.user as AuthUser | undefined;
    const token = o.token;
    if (!user || typeof user.id !== "string" || typeof token !== "string") {
      return null;
    }
    return { user, token };
  } catch {
    return null;
  }
}

function writeSession(data: StoredSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function stableUserIdFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return `user_${normalized.replace(/[^a-z0-9]+/g, "_").slice(0, 64)}`;
}

/**
 * Munkamenet-alapú belépés: böngésző sessionStorage, újratöltés után is megmarad egy tabon belül.
 * Opcionális: NEXT_PUBLIC_DEV_LOGIN_PASSWORD — ha be van állítva, a jelszónak egyeznie kell.
 */
function sessionAuth(): AuthAPI {
  return {
    isAuthenticated: () => !!readSession(),
    user: () => readSession()?.user ?? null,
    login: async (creds?: LoginCredentials) => {
      const email = creds?.email?.trim() ?? "";
      const password = creds?.password ?? "";
      if (!email) {
        throw new Error("Add meg az e-mail címet.");
      }
      if (!email.includes("@")) {
        throw new Error("Érvénytelen e-mail formátum.");
      }
      if (!password) {
        throw new Error("Add meg a jelszót.");
      }
      const expected = process.env.NEXT_PUBLIC_DEV_LOGIN_PASSWORD;
      if (expected != null && expected !== "") {
        if (password !== expected) {
          throw new Error("Hibás e-mail vagy jelszó.");
        }
      }
      const user: AuthUser = {
        id: stableUserIdFromEmail(email),
        email,
      };
      const token =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `tok_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
      writeSession({ user, token });
    },
    logout: async () => {
      clearSession();
    },
    getToken: async () => readSession()?.token ?? null,
  };
}

const mockMemory = { user: null as AuthUser | null, token: null as string | null };

function mockAuth(): AuthAPI {
  return {
    isAuthenticated: () => !!mockMemory.user,
    user: () => mockMemory.user,
    login: async () => {
      mockMemory.user = { id: "dev-user", email: "dev@example.com" };
      mockMemory.token = "dev-token";
    },
    logout: async () => {
      mockMemory.user = null;
      mockMemory.token = null;
    },
    getToken: async () => mockMemory.token,
  };
}

/**
 * NEXT_PUBLIC_AUTH_PROVIDER:
 * - `session` (alap): login oldal + sessionStorage
 * - `mock`: egy kattintásos dev belépés (memória, nem perzisztens)
 */
export function getAuth(): AuthAPI {
  const provider = (
    process.env.NEXT_PUBLIC_AUTH_PROVIDER || "session"
  ).toLowerCase();
  switch (provider) {
    case "mock":
      return mockAuth();
    default:
      return sessionAuth();
  }
}
