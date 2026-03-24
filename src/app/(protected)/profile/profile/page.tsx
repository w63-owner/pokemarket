"use client";

import { useCallback, useState } from "react";
import { useMyProfile, useUpdateProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AddressAutocomplete,
  type AddressResult,
} from "@/components/profile/address-autocomplete";
import { COUNTRY_LABELS } from "@/lib/constants";
import type { ShippingCountry } from "@/lib/constants";
import type { Profile } from "@/types";

function buildInitialAddress(profile: Profile): AddressResult | null {
  if (!profile.city && !profile.address_line) return null;

  const countryLabel =
    COUNTRY_LABELS[profile.country_code as ShippingCountry] ||
    profile.country_code;

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

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
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
      updateProfile.mutate({ avatar_url: publicUrl });
    },
    [updateProfile],
  );

  function normalizeUrl(raw: string): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfile.mutate({
      username,
      bio: bio || undefined,
      avatar_url: avatarUrl || undefined,
      country_code: address?.countryCode || profile.country_code,
      address_line: address?.addressLine || null,
      city: address?.city || null,
      postal_code: address?.postalCode || null,
      instagram_url: normalizeUrl(instagram),
      facebook_url: normalizeUrl(facebook),
      tiktok_url: normalizeUrl(tiktok),
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="font-heading text-2xl font-bold">Éditer mon profil</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="flex flex-col items-center gap-2">
          <AvatarUploader
            currentUrl={avatarUrl}
            fallback={profile.username?.charAt(0).toUpperCase() || "?"}
            onUploaded={handleAvatarUploaded}
          />
          <span className="text-muted-foreground text-xs">
            Appuyez pour changer
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Pseudo</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={3}
            maxLength={30}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Parlez de votre collection..."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Adresse</Label>
          <AddressAutocomplete
            id="address"
            value={address}
            onChange={setAddress}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-muted-foreground text-sm font-medium">
            Réseaux sociaux
          </h3>
          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="www.instagram.com/pseudo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook</Label>
            <Input
              id="facebook"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="www.facebook.com/pseudo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tiktok">TikTok</Label>
            <Input
              id="tiktok"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              placeholder="www.tiktok.com/@pseudo"
            />
          </div>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={updateProfile.isPending}
        >
          {updateProfile.isPending ? "Sauvegarde..." : "Sauvegarder"}
        </Button>
      </form>
    </div>
  );
}

export default function EditProfilePage() {
  const { data: profile, isLoading } = useMyProfile();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mx-auto size-24 rounded-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-muted-foreground mx-auto max-w-lg px-4 py-6">
        Impossible de charger le profil.
      </div>
    );
  }

  return <EditProfileForm key={profile.id} profile={profile} />;
}
