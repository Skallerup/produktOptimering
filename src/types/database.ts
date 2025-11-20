export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          base_url: string;
          created_at: string;
          last_synced_at: string | null;
        };
        Insert: {
          id?: string;
          base_url: string;
          created_at?: string;
          last_synced_at?: string | null;
        };
        Update: {
          id?: string;
          base_url?: string;
          created_at?: string;
          last_synced_at?: string | null;
        };
      };
      products: {
        Row: {
          id: string;
          store_id: string;
          remote_id: string;
          name: string;
          short_description: string | null;
          description: string | null;
          permalink: string | null;
          price: string | null;
          sku: string | null;
          image: string | null;
          meta_title: string | null;
          meta_description: string | null;
          word_count: number | null;
          raw: Json | null;
          last_crawled_at: string;
          date_created: string | null;
          brand: string | null;
          tags: string[] | null;
          stock_status: string | null;
          on_sale: boolean | null;
          featured: boolean | null;
          category_ids: number[] | null;
          category_names: string[] | null;
        };
        Insert: {
          id?: string;
          store_id: string;
          remote_id: string;
          name: string;
          short_description?: string | null;
          description?: string | null;
          permalink?: string | null;
          price?: string | null;
          sku?: string | null;
          image?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          word_count?: number | null;
          raw?: Json | null;
          last_crawled_at?: string;
          date_created?: string | null;
          brand?: string | null;
          tags?: string[] | null;
          stock_status?: string | null;
          on_sale?: boolean | null;
          featured?: boolean | null;
          category_ids?: number[] | null;
          category_names?: string[] | null;
        };
        Update: {
          id?: string;
          store_id?: string;
          remote_id?: string;
          name?: string;
          short_description?: string | null;
          description?: string | null;
          permalink?: string | null;
          price?: string | null;
          sku?: string | null;
          image?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          word_count?: number | null;
          raw?: Json | null;
          last_crawled_at?: string;
          date_created?: string | null;
          brand?: string | null;
          tags?: string[] | null;
          stock_status?: string | null;
          on_sale?: boolean | null;
          featured?: boolean | null;
          category_ids?: number[] | null;
          category_names?: string[] | null;
        };
      };
      analyses: {
        Row: {
          id: string;
          product_id: string;
          model: string;
          analysis: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          model: string;
          analysis: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          model?: string;
          analysis?: Json;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

