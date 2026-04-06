export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      card_price_history: {
        Row: {
          card_key: string;
          condition: string;
          id: string;
          is_graded: boolean;
          language: string;
          price: number;
          recorded_at: string;
          source: string;
        };
        Insert: {
          card_key: string;
          condition: string;
          id?: string;
          is_graded?: boolean;
          language: string;
          price: number;
          recorded_at?: string;
          source?: string;
        };
        Update: {
          card_key?: string;
          condition?: string;
          id?: string;
          is_graded?: boolean;
          language?: string;
          price?: number;
          recorded_at?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: "card_price_history_card_key_fkey";
            columns: ["card_key"];
            isOneToOne: false;
            referencedRelation: "tcgdex_cards";
            referencedColumns: ["card_key"];
          },
        ];
      };
      conversations: {
        Row: {
          buyer_id: string;
          created_at: string | null;
          id: string;
          listing_id: string;
          seller_id: string;
        };
        Insert: {
          buyer_id: string;
          created_at?: string | null;
          id?: string;
          listing_id: string;
          seller_id: string;
        };
        Update: {
          buyer_id?: string;
          created_at?: string | null;
          id?: string;
          listing_id?: string;
          seller_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      disputes: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          opened_by: string;
          reason: string | null;
          status: string | null;
          transaction_id: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          opened_by: string;
          reason?: string | null;
          status?: string | null;
          transaction_id: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          opened_by?: string;
          reason?: string | null;
          status?: string | null;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disputes_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "disputes_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      favorite_listings: {
        Row: {
          created_at: string | null;
          listing_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          listing_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          listing_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorite_listings_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorite_listings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      favorite_sellers: {
        Row: {
          created_at: string | null;
          seller_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          seller_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          seller_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorite_sellers_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "favorite_sellers_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      listings: {
        Row: {
          back_image_url: string | null;
          card_block: string | null;
          card_illustrator: string | null;
          card_language: string | null;
          card_number: string | null;
          card_rarity: string | null;
          card_ref_id: string | null;
          card_series: string | null;
          condition: string | null;
          cover_image_url: string | null;
          created_at: string | null;
          delivery_weight_class: string | null;
          display_price: number | null;
          grade_note: number | null;
          grading_company: string | null;
          id: string;
          is_graded: boolean | null;
          price_seller: number;
          reserved_for: string | null;
          reserved_price: number | null;
          seller_id: string;
          status: string | null;
          title: string;
          updated_at: string | null;
        };
        Insert: {
          back_image_url?: string | null;
          card_block?: string | null;
          card_illustrator?: string | null;
          card_language?: string | null;
          card_number?: string | null;
          card_rarity?: string | null;
          card_ref_id?: string | null;
          card_series?: string | null;
          condition?: string | null;
          cover_image_url?: string | null;
          created_at?: string | null;
          delivery_weight_class?: string | null;
          display_price?: number | null;
          grade_note?: number | null;
          grading_company?: string | null;
          id?: string;
          is_graded?: boolean | null;
          price_seller: number;
          reserved_for?: string | null;
          reserved_price?: number | null;
          seller_id: string;
          status?: string | null;
          title: string;
          updated_at?: string | null;
        };
        Update: {
          back_image_url?: string | null;
          card_block?: string | null;
          card_illustrator?: string | null;
          card_language?: string | null;
          card_number?: string | null;
          card_rarity?: string | null;
          card_ref_id?: string | null;
          card_series?: string | null;
          condition?: string | null;
          cover_image_url?: string | null;
          created_at?: string | null;
          delivery_weight_class?: string | null;
          display_price?: number | null;
          grade_note?: number | null;
          grading_company?: string | null;
          id?: string;
          is_graded?: boolean | null;
          price_seller?: number;
          reserved_for?: string | null;
          reserved_price?: number | null;
          seller_id?: string;
          status?: string | null;
          title?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "listings_reserved_for_fkey";
            columns: ["reserved_for"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string | null;
          conversation_id: string;
          created_at: string | null;
          id: string;
          message_type: string | null;
          metadata: Json | null;
          offer_id: string | null;
          read_at: string | null;
          sender_id: string;
        };
        Insert: {
          content?: string | null;
          conversation_id: string;
          created_at?: string | null;
          id?: string;
          message_type?: string | null;
          metadata?: Json | null;
          offer_id?: string | null;
          read_at?: string | null;
          sender_id: string;
        };
        Update: {
          content?: string | null;
          conversation_id?: string;
          created_at?: string | null;
          id?: string;
          message_type?: string | null;
          metadata?: Json | null;
          offer_id?: string | null;
          read_at?: string | null;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_offer_id_fkey";
            columns: ["offer_id"];
            isOneToOne: false;
            referencedRelation: "offers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      ocr_attempts: {
        Row: {
          candidates: Json | null;
          confidence: number | null;
          created_at: string | null;
          id: string;
          listing_id: string | null;
          model: string | null;
          parsed: Json | null;
          provider: string | null;
          raw_text: string | null;
          selected_card_ref_id: string | null;
          user_id: string;
        };
        Insert: {
          candidates?: Json | null;
          confidence?: number | null;
          created_at?: string | null;
          id?: string;
          listing_id?: string | null;
          model?: string | null;
          parsed?: Json | null;
          provider?: string | null;
          raw_text?: string | null;
          selected_card_ref_id?: string | null;
          user_id: string;
        };
        Update: {
          candidates?: Json | null;
          confidence?: number | null;
          created_at?: string | null;
          id?: string;
          listing_id?: string | null;
          model?: string | null;
          parsed?: Json | null;
          provider?: string | null;
          raw_text?: string | null;
          selected_card_ref_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ocr_attempts_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ocr_attempts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      offers: {
        Row: {
          buyer_id: string;
          conversation_id: string | null;
          created_at: string | null;
          expires_at: string | null;
          id: string;
          listing_id: string;
          offer_amount: number;
          status: string | null;
        };
        Insert: {
          buyer_id: string;
          conversation_id?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          listing_id: string;
          offer_amount: number;
          status?: string | null;
        };
        Update: {
          buyer_id?: string;
          conversation_id?: string | null;
          created_at?: string | null;
          expires_at?: string | null;
          id?: string;
          listing_id?: string;
          offer_amount?: number;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "offers_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "offers_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      price_estimations: {
        Row: {
          card_name: string;
          created_at: string | null;
          currency: string | null;
          estimated_price: number | null;
          id: string;
          set_name: string | null;
          source: string | null;
        };
        Insert: {
          card_name: string;
          created_at?: string | null;
          currency?: string | null;
          estimated_price?: number | null;
          id?: string;
          set_name?: string | null;
          source?: string | null;
        };
        Update: {
          card_name?: string;
          created_at?: string | null;
          currency?: string | null;
          estimated_price?: number | null;
          id?: string;
          set_name?: string | null;
          source?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          address_line: string | null;
          avatar_url: string | null;
          bio: string | null;
          city: string | null;
          country_code: string | null;
          created_at: string | null;
          facebook_url: string | null;
          id: string;
          instagram_url: string | null;
          kyc_status: string | null;
          postal_code: string | null;
          role: string;
          stripe_account_id: string | null;
          stripe_customer_id: string | null;
          tiktok_url: string | null;
          updated_at: string | null;
          username: string;
        };
        Insert: {
          address_line?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          country_code?: string | null;
          created_at?: string | null;
          facebook_url?: string | null;
          id: string;
          instagram_url?: string | null;
          kyc_status?: string | null;
          postal_code?: string | null;
          role?: string;
          stripe_account_id?: string | null;
          stripe_customer_id?: string | null;
          tiktok_url?: string | null;
          updated_at?: string | null;
          username: string;
        };
        Update: {
          address_line?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          city?: string | null;
          country_code?: string | null;
          created_at?: string | null;
          facebook_url?: string | null;
          id?: string;
          instagram_url?: string | null;
          kyc_status?: string | null;
          postal_code?: string | null;
          role?: string;
          stripe_account_id?: string | null;
          stripe_customer_id?: string | null;
          tiktok_url?: string | null;
          updated_at?: string | null;
          username?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          created_at: string | null;
          id: string;
          subscription: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          subscription: Json;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          subscription?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          listing_id: string;
          reason: string;
          reporter_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          listing_id: string;
          reason: string;
          reporter_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          listing_id?: string;
          reason?: string;
          reporter_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string | null;
          id: string;
          rating: number;
          reviewee_id: string;
          reviewer_id: string;
          transaction_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string | null;
          id?: string;
          rating: number;
          reviewee_id: string;
          reviewer_id: string;
          transaction_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string | null;
          id?: string;
          rating?: number;
          reviewee_id?: string;
          reviewer_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_reviewee_id_fkey";
            columns: ["reviewee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: true;
            referencedRelation: "transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      saved_searches: {
        Row: {
          created_at: string | null;
          id: string;
          last_seen_at: string;
          name: string;
          search_params: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          last_seen_at?: string;
          name: string;
          search_params: Json;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          last_seen_at?: string;
          name?: string;
          search_params?: Json;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "saved_searches_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shipping_matrix: {
        Row: {
          currency: string | null;
          dest_country: string;
          id: number;
          origin_country: string;
          price: number;
          weight_class: string;
        };
        Insert: {
          currency?: string | null;
          dest_country: string;
          id?: number;
          origin_country: string;
          price: number;
          weight_class: string;
        };
        Update: {
          currency?: string | null;
          dest_country?: string;
          id?: number;
          origin_country?: string;
          price?: number;
          weight_class?: string;
        };
        Relationships: [];
      };
      stripe_webhooks_processed: {
        Row: {
          processed_at: string | null;
          stripe_event_id: string;
        };
        Insert: {
          processed_at?: string | null;
          stripe_event_id: string;
        };
        Update: {
          processed_at?: string | null;
          stripe_event_id?: string;
        };
        Relationships: [];
      };
      tcgdex_cards: {
        Row: {
          attacks: Json | null;
          card_key: string | null;
          category: string | null;
          description: string | null;
          dex_id: Json | null;
          effect: string | null;
          energy_type: string | null;
          evolve_from: string | null;
          hp: number | null;
          id: string;
          illustrator: string | null;
          image: string | null;
          item: Json | null;
          language: string;
          legal: Json | null;
          level: string | null;
          local_id: string | null;
          name: string | null;
          pricing: Json | null;
          rarity: string | null;
          regulation_mark: string | null;
          retreat: number | null;
          set_id: string | null;
          stage: string | null;
          suffix: string | null;
          trainer_type: string | null;
          types: Json | null;
          updated_at: string | null;
          variants: Json | null;
          weaknesses: Json | null;
        };
        Insert: {
          attacks?: Json | null;
          card_key?: string | null;
          category?: string | null;
          description?: string | null;
          dex_id?: Json | null;
          effect?: string | null;
          energy_type?: string | null;
          evolve_from?: string | null;
          hp?: number | null;
          id: string;
          illustrator?: string | null;
          image?: string | null;
          item?: Json | null;
          language: string;
          legal?: Json | null;
          level?: string | null;
          local_id?: string | null;
          name?: string | null;
          pricing?: Json | null;
          rarity?: string | null;
          regulation_mark?: string | null;
          retreat?: number | null;
          set_id?: string | null;
          stage?: string | null;
          suffix?: string | null;
          trainer_type?: string | null;
          types?: Json | null;
          updated_at?: string | null;
          variants?: Json | null;
          weaknesses?: Json | null;
        };
        Update: {
          attacks?: Json | null;
          card_key?: string | null;
          category?: string | null;
          description?: string | null;
          dex_id?: Json | null;
          effect?: string | null;
          energy_type?: string | null;
          evolve_from?: string | null;
          hp?: number | null;
          id?: string;
          illustrator?: string | null;
          image?: string | null;
          item?: Json | null;
          language?: string;
          legal?: Json | null;
          level?: string | null;
          local_id?: string | null;
          name?: string | null;
          pricing?: Json | null;
          rarity?: string | null;
          regulation_mark?: string | null;
          retreat?: number | null;
          set_id?: string | null;
          stage?: string | null;
          suffix?: string | null;
          trainer_type?: string | null;
          types?: Json | null;
          updated_at?: string | null;
          variants?: Json | null;
          weaknesses?: Json | null;
        };
        Relationships: [];
      };
      tcgdex_series: {
        Row: {
          id: string;
          language: string;
          name: string;
        };
        Insert: {
          id: string;
          language: string;
          name: string;
        };
        Update: {
          id?: string;
          language?: string;
          name?: string;
        };
        Relationships: [];
      };
      tcgdex_sets: {
        Row: {
          card_count: Json | null;
          id: string;
          language: string;
          legal: Json | null;
          logo: string | null;
          name: string;
          release_date: string | null;
          series_id: string | null;
          symbol: string | null;
          tcg_online_code: string | null;
        };
        Insert: {
          card_count?: Json | null;
          id: string;
          language: string;
          legal?: Json | null;
          logo?: string | null;
          name: string;
          release_date?: string | null;
          series_id?: string | null;
          symbol?: string | null;
          tcg_online_code?: string | null;
        };
        Update: {
          card_count?: Json | null;
          id?: string;
          language?: string;
          legal?: Json | null;
          logo?: string | null;
          name?: string;
          release_date?: string | null;
          series_id?: string | null;
          symbol?: string | null;
          tcg_online_code?: string | null;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          buyer_id: string;
          created_at: string | null;
          expiration_date: string | null;
          fee_amount: number;
          id: string;
          listing_id: string;
          listing_title: string | null;
          seller_id: string;
          shipped_at: string | null;
          shipping_address_city: string | null;
          shipping_address_line: string | null;
          shipping_address_postcode: string | null;
          shipping_cost: number | null;
          shipping_country: string | null;
          status: string | null;
          stripe_checkout_session_id: string | null;
          total_amount: number;
          tracking_number: string | null;
          tracking_url: string | null;
          updated_at: string | null;
        };
        Insert: {
          buyer_id: string;
          created_at?: string | null;
          expiration_date?: string | null;
          fee_amount: number;
          id?: string;
          listing_id: string;
          listing_title?: string | null;
          seller_id: string;
          shipped_at?: string | null;
          shipping_address_city?: string | null;
          shipping_address_line?: string | null;
          shipping_address_postcode?: string | null;
          shipping_cost?: number | null;
          shipping_country?: string | null;
          status?: string | null;
          stripe_checkout_session_id?: string | null;
          total_amount: number;
          tracking_number?: string | null;
          tracking_url?: string | null;
          updated_at?: string | null;
        };
        Update: {
          buyer_id?: string;
          created_at?: string | null;
          expiration_date?: string | null;
          fee_amount?: number;
          id?: string;
          listing_id?: string;
          listing_title?: string | null;
          seller_id?: string;
          shipped_at?: string | null;
          shipping_address_city?: string | null;
          shipping_address_line?: string | null;
          shipping_address_postcode?: string | null;
          shipping_cost?: number | null;
          shipping_country?: string | null;
          status?: string | null;
          stripe_checkout_session_id?: string | null;
          total_amount?: number;
          tracking_number?: string | null;
          tracking_url?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey";
            columns: ["buyer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_listing_id_fkey";
            columns: ["listing_id"];
            isOneToOne: false;
            referencedRelation: "listings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      wallets: {
        Row: {
          available_balance: number | null;
          currency: string | null;
          pending_balance: number | null;
          user_id: string;
        };
        Insert: {
          available_balance?: number | null;
          currency?: string | null;
          pending_balance?: number | null;
          user_id: string;
        };
        Update: {
          available_balance?: number | null;
          currency?: string | null;
          pending_balance?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "wallets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      count_new_for_saved_searches: {
        Args: never;
        Returns: {
          new_count: number;
          search_id: string;
        }[];
      };
      get_inbox: {
        Args: { p_user_id: string };
        Returns: {
          buyer_id: string;
          created_at: string;
          id: string;
          last_message_content: string;
          last_message_created_at: string;
          last_message_sender_id: string;
          last_message_type: string;
          listing_cover_image_url: string;
          listing_display_price: number;
          listing_id: string;
          listing_status: string;
          listing_title: string;
          other_user_avatar_url: string;
          other_user_id: string;
          other_user_username: string;
          seller_id: string;
          unread_count: number;
        }[];
      };
      get_seller_reputation: {
        Args: { p_seller_id: string };
        Returns: {
          avg_rating: number;
          review_count: number;
        }[];
      };
      match_tcgdex_cards: {
        Args: { p_language?: string; p_name: string };
        Returns: {
          card_hp: number;
          card_id: string;
          card_illustrator: string;
          card_key: string;
          card_language: string;
          card_local_id: string;
          card_name: string;
          card_rarity: string;
          card_set_id: string;
          series_id: string;
          series_name: string;
          set_name: string;
          set_official_count: number;
        }[];
      };
      release_escrow_funds: {
        Args: { p_buyer_id: string; p_transaction_id: string };
        Returns: boolean;
      };
      search_listings_feed: {
        Args: {
          p_card_number?: string;
          p_condition?: string;
          p_cursor_created_at?: string;
          p_cursor_id?: string;
          p_cursor_price?: number;
          p_exclude_seller?: string;
          p_grade_max?: number;
          p_grade_min?: number;
          p_is_graded?: boolean;
          p_limit?: number;
          p_price_max?: number;
          p_price_min?: number;
          p_query?: string;
          p_rarity?: string;
          p_series?: string;
          p_set?: string;
          p_sort?: string;
        };
        Returns: {
          card_series: string;
          condition: string;
          cover_image_url: string;
          created_at: string;
          display_price: number;
          grade_note: number;
          id: string;
          is_graded: boolean;
          seller_avatar_url: string;
          seller_id: string;
          seller_username: string;
          title: string;
        }[];
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { "": string }; Returns: string[] };
      upsert_conversation: {
        Args: { p_buyer_id: string; p_listing_id: string };
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
