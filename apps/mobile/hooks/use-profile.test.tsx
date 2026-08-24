import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { Profile } from "@deckdealr/shared";
import { fetchMyProfile } from "@/lib/api/profile";
import { useAuth } from "@/hooks/use-auth";
import { useMyProfile } from "./use-profile";

jest.mock("@/hooks/use-auth", () => ({
  useAuth: jest.fn(),
}));
jest.mock("@/lib/api/profile", () => ({
  fetchMyProfile: jest.fn(),
}));
jest.mock("@/components/ui", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/haptics", () => ({
  haptic: jest.fn(),
}));

const mockUseAuth = jest.mocked(useAuth);
const mockFetchMyProfile = jest.mocked(fetchMyProfile);

const profile = {
  address_line: null,
  avatar_url: null,
  bio: null,
  city: null,
  country_code: "FR",
  created_at: "2026-07-31T00:00:00.000Z",
  facebook_url: null,
  id: "user-1",
  instagram_url: null,
  kyc_status: "UNVERIFIED",
  postal_code: null,
  role: "user",
  stripe_account_id: null,
  stripe_customer_id: null,
  tiktok_url: null,
  updated_at: "2026-07-31T00:00:00.000Z",
  username: "pikachu",
} satisfies Profile;

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useMyProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not cache a false null profile before auth is ready", async () => {
    mockUseAuth.mockReturnValue({ user: null } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useMyProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockFetchMyProfile).not.toHaveBeenCalled();
  });

  it("loads the profile once an authenticated user is available", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "user-1" },
    } as ReturnType<typeof useAuth>);
    mockFetchMyProfile.mockResolvedValue(profile);

    const { result } = renderHook(() => useMyProfile(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(profile);
    expect(mockFetchMyProfile).toHaveBeenCalledTimes(1);
  });
});
