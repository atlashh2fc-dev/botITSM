export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      demo_users: {
        Row: {
          id: string;
          name: string;
          email: string;
          area: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          area?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["demo_users"]["Insert"]>;
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          channel: string;
          status: string;
          context: Json;
          active_article_id: string | null;
          detected_intent: string | null;
          priority: string | null;
          created_at: string;
          updated_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          channel?: string;
          status?: string;
          context?: Json;
          active_article_id?: string | null;
          detected_intent?: string | null;
          priority?: string | null;
          created_at?: string;
          updated_at?: string;
          closed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["chat_sessions"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: string;
          content: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: string;
          content: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [];
      };
      tickets: {
        Row: {
          id: string;
          type: string;
          priority: string;
          category: string;
          description: string;
          status: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: string;
          priority: string;
          category: string;
          description: string;
          status?: string;
          payload: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tickets"]["Insert"]>;
        Relationships: [];
      };
      ticket_events: {
        Row: {
          id: string;
          ticket_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          ticket_id: string;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ticket_events"]["Insert"]>;
        Relationships: [];
      };
      knowledge_articles: {
        Row: {
          id: string;
          title: string;
          category: string;
          intent: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          title: string;
          category: string;
          intent: string;
          payload: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["knowledge_articles"]["Insert"]>;
        Relationships: [];
      };
      sla_rules: {
        Row: {
          id: string;
          priority: string;
          response_minutes: number;
          resolution_minutes: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          priority: string;
          response_minutes: number;
          resolution_minutes: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sla_rules"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
