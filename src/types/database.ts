export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string;
          slug: string;
          name: string;
          persona_description: string;
          system_prompt: string;
          model_provider: string;
          model_name: string;
          is_active: boolean;
          avatar_url: string | null;
          temperature: number;
          max_tokens: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          persona_description: string;
          system_prompt: string;
          model_provider?: string;
          model_name?: string;
          is_active?: boolean;
          avatar_url?: string | null;
          temperature?: number;
          max_tokens?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          persona_description?: string;
          system_prompt?: string;
          model_provider?: string;
          model_name?: string;
          is_active?: boolean;
          avatar_url?: string | null;
          temperature?: number;
          max_tokens?: number;
          updated_at?: string;
        };
      };
      skills: {
        Row: {
          id: string;
          agent_id: string;
          name: string;
          display_name: string;
          description: string;
          is_active: boolean;
          config: Record<string, unknown>;
          prompt_injection: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          name: string;
          display_name: string;
          description: string;
          is_active?: boolean;
          config?: Record<string, unknown>;
          prompt_injection?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          name?: string;
          display_name?: string;
          description?: string;
          is_active?: boolean;
          config?: Record<string, unknown>;
          prompt_injection?: string | null;
          updated_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          agent_id: string;
          whatsapp_user_id: string;
          whatsapp_user_name: string | null;
          started_at: string;
          last_message_at: string;
          is_active: boolean;
          metadata: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          agent_id: string;
          whatsapp_user_id: string;
          whatsapp_user_name?: string | null;
          started_at?: string;
          last_message_at?: string;
          is_active?: boolean;
          metadata?: Record<string, unknown>;
        };
        Update: {
          id?: string;
          agent_id?: string;
          whatsapp_user_id?: string;
          whatsapp_user_name?: string | null;
          last_message_at?: string;
          is_active?: boolean;
          metadata?: Record<string, unknown>;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          whatsapp_message_id: string | null;
          message_type: string;
          metadata: Record<string, unknown>;
          tokens_used: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          whatsapp_message_id?: string | null;
          message_type?: string;
          metadata?: Record<string, unknown>;
          tokens_used?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          role?: "user" | "assistant" | "system";
          content?: string;
          whatsapp_message_id?: string | null;
          message_type?: string;
          metadata?: Record<string, unknown>;
          tokens_used?: number | null;
        };
      };
      scheduled_tasks: {
        Row: {
          id: string;
          agent_id: string;
          task_type: string;
          cron_expression: string | null;
          next_run_at: string | null;
          last_run_at: string | null;
          payload: Record<string, unknown>;
          target_whatsapp_id: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          task_type: string;
          cron_expression?: string | null;
          next_run_at?: string | null;
          payload?: Record<string, unknown>;
          target_whatsapp_id: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          task_type?: string;
          cron_expression?: string | null;
          next_run_at?: string | null;
          last_run_at?: string | null;
          payload?: Record<string, unknown>;
          target_whatsapp_id?: string;
          is_active?: boolean;
        };
      };
      settings: {
        Row: {
          key: string;
          value: string;
          is_secret: boolean;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          is_secret?: boolean;
          updated_at?: string;
        };
        Update: {
          value?: string;
          is_secret?: boolean;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          agent_slug: string;
          whatsapp_user_id: string;
          title: string;
          description: string | null;
          task_type: string;
          status: string;
          priority: string;
          due_at: string | null;
          remind_at: string | null;
          is_reminder_sent: boolean;
          completed_at: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_slug: string;
          whatsapp_user_id: string;
          title: string;
          description?: string | null;
          task_type?: string;
          status?: string;
          priority?: string;
          due_at?: string | null;
          remind_at?: string | null;
          is_reminder_sent?: boolean;
          completed_at?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_slug?: string;
          title?: string;
          description?: string | null;
          task_type?: string;
          status?: string;
          priority?: string;
          due_at?: string | null;
          remind_at?: string | null;
          is_reminder_sent?: boolean;
          completed_at?: string | null;
          metadata?: Record<string, unknown>;
          updated_at?: string;
        };
      };
      integrations: {
        Row: {
          id: string;
          provider: string;
          provider_account_id: string;
          access_token: string;
          refresh_token: string;
          token_expires_at: string;
          scopes: string[];
          metadata: Record<string, unknown>;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          provider_account_id: string;
          access_token: string;
          refresh_token: string;
          token_expires_at: string;
          scopes?: string[];
          metadata?: Record<string, unknown>;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          provider_account_id?: string;
          access_token?: string;
          refresh_token?: string;
          token_expires_at?: string;
          scopes?: string[];
          metadata?: Record<string, unknown>;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      usage_logs: {
        Row: {
          id: string;
          agent_id: string;
          model_provider: string;
          model_name: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd: number | null;
          conversation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_id: string;
          model_provider: string;
          model_name: string;
          input_tokens: number;
          output_tokens: number;
          cost_usd?: number | null;
          conversation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_id?: string;
          model_provider?: string;
          model_name?: string;
          input_tokens?: number;
          output_tokens?: number;
          cost_usd?: number | null;
          conversation_id?: string | null;
        };
      };
    };
  };
};

// Convenience types
export type Agent = Database["public"]["Tables"]["agents"]["Row"];
export type AgentInsert = Database["public"]["Tables"]["agents"]["Insert"];
export type AgentUpdate = Database["public"]["Tables"]["agents"]["Update"];

export type Skill = Database["public"]["Tables"]["skills"]["Row"];
export type SkillInsert = Database["public"]["Tables"]["skills"]["Insert"];
export type SkillUpdate = Database["public"]["Tables"]["skills"]["Update"];

export type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
export type Message = Database["public"]["Tables"]["messages"]["Row"];
export type ScheduledTask = Database["public"]["Tables"]["scheduled_tasks"]["Row"];
export type Setting = Database["public"]["Tables"]["settings"]["Row"];
export type UsageLog = Database["public"]["Tables"]["usage_logs"]["Row"];

export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export type Integration = Database["public"]["Tables"]["integrations"]["Row"];
export type IntegrationInsert = Database["public"]["Tables"]["integrations"]["Insert"];
export type IntegrationUpdate = Database["public"]["Tables"]["integrations"]["Update"];
