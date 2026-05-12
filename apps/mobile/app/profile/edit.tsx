import { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  COUNTRY_LABELS,
  type Profile,
  type ShippingCountry,
} from "@pokemarket/shared";

import {
  Button,
  Input,
  Label,
  Skeleton,
  SmartBackButton,
  Text,
  Textarea,
} from "@/components/ui";
import { useMyProfile, useUpdateProfile } from "@/hooks/use-profile";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import {
  AddressAutocomplete,
  type AddressResult,
} from "@/components/profile/address-autocomplete";

function buildInitialAddress(profile: Profile): AddressResult | null {
  if (!profile.city && !profile.address_line) return null;

  const countryLabel =
    COUNTRY_LABELS[profile.country_code as ShippingCountry] ||
    profile.country_code ||
    "";

  const parts: string[] = [];
  if (profile.address_line) parts.push(profile.address_line);
  if (profile.city) parts.push(profile.city);
  if (profile.postal_code) parts.push(profile.postal_code);
  if (countryLabel) parts.push(countryLabel);

  return {
    label: parts.join(", "),
    addressLine: profile.address_line || "",
    city: profile.city || "",
    postalCode: profile.postal_code || "",
    countryCode: profile.country_code ?? "",
  };
}

function EditProfileForm({ profile }: { profile: Profile }) {
  const updateProfile = useUpdateProfile();

  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(
    profile.avatar_url,
  );
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || "");
  const [address, setAddress] = useState<AddressResult | null>(
    buildInitialAddress(profile),
  );
  const [instagram, setInstagram] = useState(profile.instagram_url || "");
  const [facebook, setFacebook] = useState(profile.facebook_url || "");
  const [tiktok, setTiktok] = useState(profile.tiktok_url || "");

  const handleAvatarUploaded = useCallback(
    (publicUrl: string) => {
      setAvatarUrl(publicUrl);
      // Persist immediately so a navigation-away preserves the change.
      updateProfile.mutate({ avatar_url: publicUrl });
    },
    [updateProfile],
  );

  const handleSubmit = useCallback(() => {
    if (!username || username.trim().length < 3) return;
    updateProfile.mutate(
      {
        username,
        bio: bio || undefined,
        avatar_url: avatarUrl || undefined,
        country_code: address?.countryCode || profile.country_code || undefined,
        address_line: address?.addressLine || null,
        city: address?.city || null,
        postal_code: address?.postalCode || null,
        instagram_url: instagram,
        facebook_url: facebook,
        tiktok_url: tiktok,
      },
      {
        onSuccess: () => {
          if (router.canGoBack()) router.back();
        },
      },
    );
  }, [
    username,
    bio,
    avatarUrl,
    address,
    instagram,
    facebook,
    tiktok,
    profile.country_code,
    updateProfile,
  ]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="items-center gap-2">
          <AvatarUploader
            currentUrl={avatarUrl}
            fallback={profile.username?.charAt(0).toUpperCase() || "?"}
            onUploaded={handleAvatarUploaded}
          />
        </View>

        <View className="gap-2">
          <Label>Pseudo</Label>
          <Input
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
          />
        </View>

        <View className="gap-2">
          <Label>Bio</Label>
          <Textarea
            value={bio}
            onChangeText={setBio}
            placeholder="Parlez de votre collection…"
            maxLength={500}
            numberOfLines={4}
          />
        </View>

        <View className="gap-2">
          <Label>Adresse</Label>
          <AddressAutocomplete value={address} onChange={setAddress} />
        </View>

        <View className="gap-3">
          <Text variant="muted" className="text-sm font-medium">
            Réseaux sociaux
          </Text>
          <View className="gap-2">
            <Label>Instagram</Label>
            <Input
              value={instagram}
              onChangeText={setInstagram}
              placeholder="www.instagram.com/pseudo"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <View className="gap-2">
            <Label>Facebook</Label>
            <Input
              value={facebook}
              onChangeText={setFacebook}
              placeholder="www.facebook.com/pseudo"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <View className="gap-2">
            <Label>TikTok</Label>
            <Input
              value={tiktok}
              onChangeText={setTiktok}
              placeholder="www.tiktok.com/@pseudo"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
        </View>

        <Button
          size="lg"
          loading={updateProfile.isPending}
          disabled={!username || username.trim().length < 3}
          onPress={handleSubmit}
        >
          Sauvegarder
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FormSkeleton() {
  return (
    <View className="gap-4 p-4">
      <Skeleton className="mx-auto h-24 w-24 rounded-full" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
    </View>
  );
}

export default function EditProfileScreen() {
  const { data: profile, isLoading } = useMyProfile();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center gap-3 border-b border-border bg-card px-2 py-3">
        <SmartBackButton fallbackHref="/(tabs)/profile" />
        <Text className="text-base font-semibold">Éditer mon profil</Text>
      </View>

      {isLoading ? (
        <FormSkeleton />
      ) : !profile ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="muted" className="text-center">
            Impossible de charger le profil.
          </Text>
        </View>
      ) : (
        <EditProfileForm key={profile.id} profile={profile} />
      )}
    </SafeAreaView>
  );
}
