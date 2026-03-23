// This file should be regenerated with: npx supabase gen types typescript --project-id <id>
// For now, we define manual types matching our schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          avatar_url: string | null;
          country_code: string;
          bio: string | null;
          instagram_url: string | null;
          facebook_url: string | null;
          tiktok_url: string | null;
          stripe_account_id: string | null;
          stripe_customer_id: string | null;
          kyc_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          avatar_url?: string | null;
          country_code?: string;
          bio?: string | null;
          instagram_url?: string | null;
          facebook_url?: string | null;
          tiktok_url?: string | null;
          stripe_account_id?: string | null;
          stripe_customer_id?: string | null;
          kyc_status?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      wallets: {
        Row: {
          user_id: string;
          available_balance: number;
          pending_balance: number;
          currency: string;
        };
        Insert: {
          user_id: string;
          available_balance?: number;
          pending_balance?: number;
          currency?: string;
        };
        Update: Partial<Database["public"]["Tables"]["wallets"]["Insert"]>;
      };
      listings: {
        Row: {
          id: string;
          seller_id: string;
          card_ref_id: string | null;
          title: string;
          price_seller: number;
          display_price: number;
          condition: string | null;
          is_graded: boolean;
          grading_company: string | null;
          grade_note: number | null;
          status: string;
          delivery_weight_class: string;
          cover_image_url: string | null;
          back_image_url: string | null;
          reserved_for: string | null;
          reserved_price: number | null;
          card_series: string | null;
          card_block: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_id: string;
          card_ref_id?: string | null;
          title: string;
          price_seller: number;
          condition?: string | null;
          is_graded?: boolean;
          grading_company?: string | null;
          grade_note?: number | null;
          status?: string;
          delivery_weight_class?: string;
          cover_image_url?: string | null;
          back_image_url?: string | null;
          reserved_for?: string | null;
          reserved_price?: number | null;
          card_series?: string | null;
          card_block?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Insert"]>;
      };
      transactions: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          total_amount: number;
          fee_amount: number;
          shipping_cost: number;
          status: string;
          stripe_checkout_session_id: string | null;
          expiration_date: string;
          listing_title: string | null;
          tracking_number: string | null;
          tracking_url: string | null;
          shipped_at: string | null;
          shipping_address_line: string | null;
          shipping_address_city: string | null;
          shipping_address_postcode: string | null;
          shipping_country: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          total_amount: number;
          fee_amount: number;
          shipping_cost?: number;
          status?: string;
          stripe_checkout_session_id?: string | null;
          listing_title?: string | null;
          shipping_address_line?: string | null;
          shipping_address_city?: string | null;
          shipping_address_postcode?: string | null;
          shipping_country?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
      };
      conversations: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["conversations"]["Insert"]
        >;
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string | null;
          message_type: string;
          offer_id: string | null;
          metadata: Json | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content?: string | null;
          message_type?: string;
          offer_id?: string | null;
          metadata?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Insert"]> & {
          read_at?: string | null;
        };
      };
      offers: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          offer_amount: number;
          status: string;
          expires_at: string;
          conversation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          listing_id: string;
          buyer_id: string;
          offer_amount: number;
          status?: string;
          conversation_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["offers"]["Insert"]>;
      };
      reviews: {
        Row: {
          id: string;
          transaction_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          comment?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["reviews"]["Insert"]>;
      };
      disputes: {
        Row: {
          id: string;
          transaction_id: string;
          opened_by: string;
          reason: string | null;
          description: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          opened_by: string;
          reason?: string | null;
          description?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["disputes"]["Insert"]>;
      };
      favorite_listings: {
        Row: { user_id: string; listing_id: string; created_at: string };
        Insert: { user_id: string; listing_id: string };
        Update: Partial<
          Database["public"]["Tables"]["favorite_listings"]["Insert"]
        >;
      };
      favorite_sellers: {
        Row: { user_id: string; seller_id: string; created_at: string };
        Insert: { user_id: string; seller_id: string };
        Update: Partial<
          Database["public"]["Tables"]["favorite_sellers"]["Insert"]
        >;
      };
      saved_searches: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          search_params: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          search_params: Json;
        };
        Update: Partial<
          Database["public"]["Tables"]["saved_searches"]["Insert"]
        >;
      };
      shipping_matrix: {
        Row: {
          id: number;
          origin_country: string;
          dest_country: string;
          weight_class: string;
          price: number;
          currency: string;
        };
        Insert: {
          origin_country: string;
          dest_country: string;
          weight_class: string;
          price: number;
          currency?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["shipping_matrix"]["Insert"]
        >;
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          subscription: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          subscription: Json;
        };
        Update: Partial<
          Database["public"]["Tables"]["push_subscriptions"]["Insert"]
        >;
      };
      tcgdex_series: {
        Row: {
          language: string;
          id: string;
          name: string;
        };
        Insert: {
          language: string;
          id: string;
          name: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["tcgdex_series"]["Insert"]
        >;
      };
      tcgdex_sets: {
        Row: {
          language: string;
          id: string;
          name: string;
          series_id: string | null;
          logo: string | null;
          release_date: string | null;
        };
        Insert: {
          language: string;
          id: string;
          name: string;
          series_id?: string | null;
          logo?: string | null;
          release_date?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["tcgdex_sets"]["Insert"]>;
      };
      tcgdex_cards: {
        Row: {
          language: string;
          id: string;
          card_key: string;
          name: string | null;
          set_id: string | null;
          hp: number | null;
          rarity: string | null;
          variants: Json | null;
        };
        Insert: {
          language: string;
          id: string;
          name?: string | null;
          set_id?: string | null;
          hp?: number | null;
          rarity?: string | null;
          variants?: Json | null;
        };
        Update: Partial<Database["public"]["Tables"]["tcgdex_cards"]["Insert"]>;
      };
      ocr_attempts: {
        Row: {
          id: string;
          user_id: string;
          image_url: string;
          raw_response: Json | null;
          selected_card_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url: string;
          raw_response?: Json | null;
          selected_card_key?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ocr_attempts"]["Insert"]>;
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_listings_feed: {
        Args: {
          p_query?: string;
          p_set?: string;
          p_rarity?: string;
          p_condition?: string;
          p_is_graded?: boolean;
          p_grade_min?: number;
          p_grade_max?: number;
          p_price_min?: number;
          p_price_max?: number;
          p_sort?: string;
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_cursor_price?: number;
          p_limit?: number;
          p_exclude_seller?: string;
        };
        Returns: {
          id: string;
          seller_id: string;
          title: string;
          display_price: number;
          condition: string;
          is_graded: boolean;
          grade_note: number | null;
          cover_image_url: string | null;
          card_series: string | null;
          created_at: string;
          seller_username: string;
          seller_avatar_url: string | null;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
