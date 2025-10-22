export type AuthUser = { id: string; email?: string | null };
export type AuthAPI = {
  isAuthenticated: () => boolean;
  user: () => AuthUser | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
};

const memory = { user: null as AuthUser | null, token: null as string | null };

function mockAuth(): AuthAPI {
  return {
    isAuthenticated: () => !!memory.user,
    user: () => memory.user,
    login: async () => { memory.user = { id: "dev-user", email: "dev@example.com" }; memory.token = "dev-token"; },
    logout: async () => { memory.user = null; memory.token = null; },
    getToken: async () => memory.token,
  };
}

// Későbbre: 'auth0' | 'supabase' | 'clerk'
export function getAuth(): AuthAPI {
  const provider = (process.env.NEXT_PUBLIC_AUTH_PROVIDER || process.env.AUTH_PROVIDER || "mock").toLowerCase();
  switch (provider) {
    // case "auth0": return auth0Client();
    // case "supabase": return supabaseClient();
    // case "clerk": return clerkClient();
    default:
      return mockAuth();
  }
}
