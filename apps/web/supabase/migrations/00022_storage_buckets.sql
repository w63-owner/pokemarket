-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('listing-images', 'listing-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp']),
  ('message_attachments', 'message_attachments', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']);

-- listing-images: public read
CREATE POLICY "listing_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'listing-images');

-- listing-images: authenticated users can upload to their own folder
CREATE POLICY "listing_images_user_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'listing-images'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

-- listing-images: users can update/delete their own files
CREATE POLICY "listing_images_user_manage" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'listing-images'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

CREATE POLICY "listing_images_user_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'listing-images'
    AND (SELECT auth.uid())::text = (storage.foldername(name))[1]
  );

-- message_attachments: conversation participants only
CREATE POLICY "msg_attachments_participant_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'message_attachments'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.buyer_id = (SELECT auth.uid()) OR c.seller_id = (SELECT auth.uid()))
    )
  );

CREATE POLICY "msg_attachments_participant_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'message_attachments'
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id::text = (storage.foldername(name))[1]
        AND (c.buyer_id = (SELECT auth.uid()) OR c.seller_id = (SELECT auth.uid()))
    )
  );
