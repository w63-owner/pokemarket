"use client";

import { useState } from "react";
import { useMyProfile, useUpdateProfile } from "@/hooks/use-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { COUNTRY_LABELS } from "@/lib/constants";
import type { Profile } from "@/types";

function EditProfileForm({ profile }: { profile: Profile }) {
  const updateProfile = useUpdateProfile();

  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || "");
  const [country, setCountry] = useState(profile.country_code);
  const [instagram, setInstagram] = useState(profile.instagram_url || "");
  const [facebook, setFacebook] = useState(profile.facebook_url || "");
  const [tiktok, setTiktok] = useState(profile.tiktok_url || "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updateProfile.mutate({
      username,
      bio: bio || undefined,
      country_code: country,
      instagram_url: instagram || undefined,
      facebook_url: facebook || undefined,
      tiktok_url: tiktok || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="font-heading text-2xl font-bold">Éditer mon profil</h1>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <div className="flex justify-center">
          <Avatar className="size-24">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="text-2xl">
              {profile.username?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
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
          <Label htmlFor="country">Pays</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
          >
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-4">
          <h3 className="text-muted-foreground text-sm font-medium">
            Réseaux sociaux
          </h3>
          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              type="url"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="https://instagram.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="facebook">Facebook</Label>
            <Input
              id="facebook"
              type="url"
              value={facebook}
              onChange={(e) => setFacebook(e.target.value)}
              placeholder="https://facebook.com/..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tiktok">TikTok</Label>
            <Input
              id="tiktok"
              type="url"
              value={tiktok}
              onChange={(e) => setTiktok(e.target.value)}
              placeholder="https://tiktok.com/@..."
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
