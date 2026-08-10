export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      bot_user_memory: {
        Row: {
          tenant_id: string | null;
          email: string;
          name: string | null;
          area: string | null;
          zammad_user_id: number | null;
          preferred_tone: string | null;
          profile: Json;
          episodic_summary: string | null;
          interaction_count: number;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id?: string | null;
          email: string;
          name?: string | null;
          area?: string | null;
          zammad_user_id?: number | null;
          preferred_tone?: string | null;
          profile?: Json;
          episodic_summary?: string | null;
          interaction_count?: number;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bot_user_memory"]["Insert"]>;
        Relationships: [];
      };
      demo_users: {
        Row: {
          tenant_id: string | null;
          id: string;
          name: string;
          email: string;
          area: string | null;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
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
          tenant_id: string | null;
          id: string;
          channel: string;
          status: string;
          context: Json;
          active_article_id: string | null;
          detected_intent: string | null;
          priority: string | null;
          user_email: string | null;
          created_at: string;
          updated_at: string;
          closed_at: string | null;
        };
        Insert: {
          tenant_id?: string | null;
          id?: string;
          channel?: string;
          status?: string;
          context?: Json;
          active_article_id?: string | null;
          detected_intent?: string | null;
          priority?: string | null;
          user_email?: string | null;
          created_at?: string;
          updated_at?: string;
          closed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["chat_sessions"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          tenant_id: string | null;
          id: string;
          session_id: string;
          role: string;
          content: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
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
          tenant_id: string | null;
          id: string;
          type: string;
          priority: string;
          category: string;
          description: string;
          status: string;
          payload: Json;
          provider: string | null;
          external_id: string | null;
          external_url: string | null;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
          id?: string;
          type: string;
          priority: string;
          category: string;
          description: string;
          status?: string;
          payload: Json;
          provider?: string | null;
          external_id?: string | null;
          external_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tickets"]["Insert"]>;
        Relationships: [];
      };
      ticket_events: {
        Row: {
          tenant_id: string | null;
          id: string;
          ticket_id: string;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
          id?: string;
          ticket_id: string;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ticket_events"]["Insert"]>;
        Relationships: [];
      };
      telephony_calls: {
        Row: {
          tenant_id: string;
          call_id: string;
          direction: string;
          from_number: string;
          to_number: string;
          queue: string | null;
          agent_extension: string | null;
          status: string;
          cause: string | null;
          duration_seconds: number | null;
          zammad_ticket_id: number | null;
          zammad_ticket_number: string | null;
          local_ticket_id: string | null;
          ticket_processing_started_at: string | null;
          ticket_processing_error: string | null;
          started_at: string;
          answered_at: string | null;
          ended_at: string | null;
          last_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          call_id: string;
          direction: string;
          from_number: string;
          to_number: string;
          queue?: string | null;
          agent_extension?: string | null;
          status?: string;
          cause?: string | null;
          duration_seconds?: number | null;
          zammad_ticket_id?: number | null;
          zammad_ticket_number?: string | null;
          local_ticket_id?: string | null;
          ticket_processing_started_at?: string | null;
          ticket_processing_error?: string | null;
          started_at?: string;
          answered_at?: string | null;
          ended_at?: string | null;
          last_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["telephony_calls"]["Insert"]>;
        Relationships: [];
      };
      telephony_events: {
        Row: {
          tenant_id: string;
          event_id: string;
          call_id: string;
          event_type: string;
          occurred_at: string;
          payload: Json;
          processing_started_at: string;
          processed_at: string | null;
          processing_error: string | null;
          cti_processed_at: string | null;
          cti_error: string | null;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          event_id: string;
          call_id: string;
          event_type: string;
          occurred_at: string;
          payload: Json;
          processing_started_at?: string;
          processed_at?: string | null;
          processing_error?: string | null;
          cti_processed_at?: string | null;
          cti_error?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["telephony_events"]["Insert"]>;
        Relationships: [];
      };
      knowledge_articles: {
        Row: {
          tenant_id: string | null;
          id: string;
          title: string;
          category: string;
          intent: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
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
          tenant_id: string | null;
          id: string;
          priority: string;
          response_minutes: number;
          resolution_minutes: number;
          created_at: string;
        };
        Insert: {
          tenant_id?: string | null;
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
    Functions: {
      claim_telephony_event: {
        Args: {
          p_tenant_id: string;
          p_event_id: string;
          p_call_id: string;
          p_event_type: string;
          p_occurred_at: string;
          p_payload: Json;
          p_lease_seconds?: number;
        };
        Returns: string;
      };
      claim_telephony_ticket: {
        Args: {
          p_tenant_id: string;
          p_call_id: string;
          p_lease_seconds?: number;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
