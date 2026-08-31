export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_plugin_attachments: {
        Row: {
          agent_id: string
          attached_at: string
          attached_by_profile_id: string | null
          detached_at: string | null
          id: string
          plugin_component_id: string
        }
        Insert: {
          agent_id: string
          attached_at?: string
          attached_by_profile_id?: string | null
          detached_at?: string | null
          id?: string
          plugin_component_id: string
        }
        Update: {
          agent_id?: string
          attached_at?: string
          attached_by_profile_id?: string | null
          detached_at?: string | null
          id?: string
          plugin_component_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_plugin_attachments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_plugin_attachments_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_plugin_attachments_attached_by_profile_id_fkey"
            columns: ["attached_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_plugin_attachments_plugin_component_id_fkey"
            columns: ["plugin_component_id"]
            isOneToOne: false
            referencedRelation: "plugin_components"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_definition_hash: string | null
          agent_definition_path: string | null
          agent_id: string | null
          attached_skills: Json
          base_commit: string | null
          blocked_reason: string | null
          branch: string | null
          canonical_work_order_id: string | null
          company_id: string | null
          created_at: string
          created_by_profile_id: string | null
          current_step: string | null
          error: string | null
          estimated_cost_usd: number | null
          execution_provider: string
          finished_at: string | null
          head_commit: string | null
          id: string
          last_event: string | null
          last_heartbeat_at: string | null
          provider_run_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["work_status"]
          summary: string | null
          task_id: string | null
          token_usage: Json | null
          updated_at: string
          verification_status: string | null
          worker_id: string | null
          worktree_path: string | null
        }
        Insert: {
          agent_definition_hash?: string | null
          agent_definition_path?: string | null
          agent_id?: string | null
          attached_skills?: Json
          base_commit?: string | null
          blocked_reason?: string | null
          branch?: string | null
          canonical_work_order_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          current_step?: string | null
          error?: string | null
          estimated_cost_usd?: number | null
          execution_provider?: string
          finished_at?: string | null
          head_commit?: string | null
          id?: string
          last_event?: string | null
          last_heartbeat_at?: string | null
          provider_run_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          summary?: string | null
          task_id?: string | null
          token_usage?: Json | null
          updated_at?: string
          verification_status?: string | null
          worker_id?: string | null
          worktree_path?: string | null
        }
        Update: {
          agent_definition_hash?: string | null
          agent_definition_path?: string | null
          agent_id?: string | null
          attached_skills?: Json
          base_commit?: string | null
          blocked_reason?: string | null
          branch?: string | null
          canonical_work_order_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          current_step?: string | null
          error?: string | null
          estimated_cost_usd?: number | null
          execution_provider?: string
          finished_at?: string | null
          head_commit?: string | null
          id?: string
          last_event?: string | null
          last_heartbeat_at?: string | null
          provider_run_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          summary?: string | null
          task_id?: string | null
          token_usage?: Json | null
          updated_at?: string
          verification_status?: string | null
          worker_id?: string | null
          worktree_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_canonical_work_order_id_fkey"
            columns: ["canonical_work_order_id"]
            isOneToOne: false
            referencedRelation: "canonical_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          active: boolean | null
          allowed_tools: Json | null
          capabilities: string[]
          category: string | null
          cost_limit_usd: number | null
          created_at: string | null
          definition_hash: string | null
          definition_path: string | null
          description: string | null
          display_name: string | null
          execution_provider: string | null
          forbidden_actions: Json | null
          has_production_authority: boolean
          id: string
          name: string
          permission_mode: string | null
          provenance: Json | null
          role: string
          skills: Json | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          allowed_tools?: Json | null
          capabilities?: string[]
          category?: string | null
          cost_limit_usd?: number | null
          created_at?: string | null
          definition_hash?: string | null
          definition_path?: string | null
          description?: string | null
          display_name?: string | null
          execution_provider?: string | null
          forbidden_actions?: Json | null
          has_production_authority?: boolean
          id?: string
          name: string
          permission_mode?: string | null
          provenance?: Json | null
          role: string
          skills?: Json | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          allowed_tools?: Json | null
          capabilities?: string[]
          category?: string | null
          cost_limit_usd?: number | null
          created_at?: string | null
          definition_hash?: string | null
          definition_path?: string | null
          description?: string | null
          display_name?: string | null
          execution_provider?: string | null
          forbidden_actions?: Json | null
          has_production_authority?: boolean
          id?: string
          name?: string
          permission_mode?: string | null
          provenance?: Json | null
          role?: string
          skills?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_pricing_settings: {
        Row: {
          id: boolean
          markup_multiplier: number
          updated_at: string | null
          updated_by_profile_id: string | null
        }
        Insert: {
          id?: boolean
          markup_multiplier?: number
          updated_at?: string | null
          updated_by_profile_id?: string | null
        }
        Update: {
          id?: boolean
          markup_multiplier?: number
          updated_at?: string | null
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_pricing_settings_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_providers: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          id: string
          is_active: boolean
          label: string
          model: string
          provider: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          is_active?: boolean
          label: string
          model: string
          provider: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          id?: string
          is_active?: boolean
          label?: string
          model?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_providers_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reply_log: {
        Row: {
          channel_id: string | null
          created_at: string | null
          evidence_refs: Json | null
          id: string
          mode: string
          person_id: string | null
          reply_text: string
          work_order_id: string | null
        }
        Insert: {
          channel_id?: string | null
          created_at?: string | null
          evidence_refs?: Json | null
          id?: string
          mode: string
          person_id?: string | null
          reply_text: string
          work_order_id?: string | null
        }
        Update: {
          channel_id?: string | null
          created_at?: string | null
          evidence_refs?: Json | null
          id?: string
          mode?: string
          person_id?: string | null
          reply_text?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_reply_log_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reply_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_reply_log_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          approval_payload: Json | null
          approver_profile_id: string | null
          company_id: string | null
          created_at: string | null
          decided_at: string | null
          decision_notes: string | null
          domain: Database["public"]["Enums"]["approval_domain"]
          id: string
          proposal_id: string | null
          reason: string | null
          requested_by_profile_id: string | null
          risk_level: Database["public"]["Enums"]["risk_level"] | null
          status: Database["public"]["Enums"]["approval_status"] | null
          task_id: string | null
          title: string
        }
        Insert: {
          approval_payload?: Json | null
          approver_profile_id?: string | null
          company_id?: string | null
          created_at?: string | null
          decided_at?: string | null
          decision_notes?: string | null
          domain?: Database["public"]["Enums"]["approval_domain"]
          id?: string
          proposal_id?: string | null
          reason?: string | null
          requested_by_profile_id?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          status?: Database["public"]["Enums"]["approval_status"] | null
          task_id?: string | null
          title: string
        }
        Update: {
          approval_payload?: Json | null
          approver_profile_id?: string | null
          company_id?: string | null
          created_at?: string | null
          decided_at?: string | null
          decision_notes?: string | null
          domain?: Database["public"]["Enums"]["approval_domain"]
          id?: string
          proposal_id?: string | null
          reason?: string | null
          requested_by_profile_id?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          status?: Database["public"]["Enums"]["approval_status"] | null
          task_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_approver_profile_id_fkey"
            columns: ["approver_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "safe_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_profile_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          company_id: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
        }
        Insert: {
          actor_profile_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          company_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
        }
        Update: {
          actor_profile_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          company_id?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_accounts: {
        Row: {
          company_id: string
          created_at: string | null
          currency: string
          id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          currency?: string
          id?: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          currency?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      board_columns: {
        Row: {
          board_id: string
          canonical_status: Database["public"]["Enums"]["work_status"]
          color: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          wip_limit: number | null
        }
        Insert: {
          board_id: string
          canonical_status?: Database["public"]["Enums"]["work_status"]
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          wip_limit?: number | null
        }
        Update: {
          board_id?: string
          canonical_status?: Database["public"]["Enums"]["work_status"]
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          wip_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "board_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      board_items: {
        Row: {
          added_by_profile_id: string
          board_id: string
          column_id: string
          created_at: string
          id: string
          position: number
          task_id: string
          updated_at: string
        }
        Insert: {
          added_by_profile_id?: string
          board_id: string
          column_id: string
          created_at?: string
          id?: string
          position?: number
          task_id: string
          updated_at?: string
        }
        Update: {
          added_by_profile_id?: string
          board_id?: string
          column_id?: string
          created_at?: string
          id?: string
          position?: number
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_items_added_by_profile_id_fkey"
            columns: ["added_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_items_column_id_board_id_fkey"
            columns: ["column_id", "board_id"]
            isOneToOne: false
            referencedRelation: "board_columns"
            referencedColumns: ["id", "board_id"]
          },
          {
            foreignKeyName: "board_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          archived_at: string | null
          color: string
          company_id: string
          created_at: string
          created_by_profile_id: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color?: string
          company_id: string
          created_at?: string
          created_by_profile_id?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color?: string
          company_id?: string
          created_at?: string
          created_by_profile_id?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boards_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_work_orders: {
        Row: {
          acceptance_criteria: Json
          company_id: string
          completed_at: string | null
          created_at: string
          created_by_profile_id: string | null
          goal_id: string | null
          id: string
          objective: string | null
          owner_agent_id: string | null
          owner_person_id: string | null
          owner_type: string
          previous_status: Database["public"]["Enums"]["work_status"] | null
          priority: Database["public"]["Enums"]["priority_level"]
          requested_by_profile_id: string | null
          risk_level: Database["public"]["Enums"]["risk_level"]
          status: Database["public"]["Enums"]["work_status"]
          title: string
          updated_at: string
          work_type: string
        }
        Insert: {
          acceptance_criteria?: Json
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          goal_id?: string | null
          id?: string
          objective?: string | null
          owner_agent_id?: string | null
          owner_person_id?: string | null
          owner_type?: string
          previous_status?: Database["public"]["Enums"]["work_status"] | null
          priority?: Database["public"]["Enums"]["priority_level"]
          requested_by_profile_id?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          status?: Database["public"]["Enums"]["work_status"]
          title: string
          updated_at?: string
          work_type?: string
        }
        Update: {
          acceptance_criteria?: Json
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          goal_id?: string | null
          id?: string
          objective?: string | null
          owner_agent_id?: string | null
          owner_person_id?: string | null
          owner_type?: string
          previous_status?: Database["public"]["Enums"]["work_status"] | null
          priority?: Database["public"]["Enums"]["priority_level"]
          requested_by_profile_id?: string | null
          risk_level?: Database["public"]["Enums"]["risk_level"]
          status?: Database["public"]["Enums"]["work_status"]
          title?: string
          updated_at?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canonical_work_orders_requested_by_profile_id_fkey"
            columns: ["requested_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_channels: {
        Row: {
          archived: boolean
          company_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_channels_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          aliases: string[]
          country: string | null
          created_at: string
          created_by_profile_id: string | null
          description: string | null
          id: string
          is_seed_data: boolean | null
          legal_entity_name: string | null
          name: string
          organization_type: string
          risk_score: number | null
          status: string | null
          strategic_priority: number | null
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          country?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          is_seed_data?: boolean | null
          legal_entity_name?: string | null
          name: string
          organization_type?: string
          risk_score?: number | null
          status?: string | null
          strategic_priority?: number | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          country?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string | null
          id?: string
          is_seed_data?: boolean | null
          legal_entity_name?: string | null
          name?: string
          organization_type?: string
          risk_score?: number | null
          status?: string | null
          strategic_priority?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_memberships: {
        Row: {
          active: boolean | null
          company_id: string
          created_at: string | null
          id: string
          profile_id: string
          role_in_company: string
        }
        Insert: {
          active?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          profile_id: string
          role_in_company?: string
        }
        Update: {
          active?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          profile_id?: string
          role_in_company?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_relationships: {
        Row: {
          company_id: string
          created_at: string | null
          created_by_profile_id: string | null
          effective_date: string | null
          id: string
          notes: string | null
          owner_profile_id: string | null
          ownership_pct: number | null
          related_company_id: string | null
          relationship_type: Database["public"]["Enums"]["company_relationship_type"]
          state: Database["public"]["Enums"]["relationship_state"]
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          created_by_profile_id?: string | null
          effective_date?: string | null
          id?: string
          notes?: string | null
          owner_profile_id?: string | null
          ownership_pct?: number | null
          related_company_id?: string | null
          relationship_type?: Database["public"]["Enums"]["company_relationship_type"]
          state?: Database["public"]["Enums"]["relationship_state"]
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          created_by_profile_id?: string | null
          effective_date?: string | null
          id?: string
          notes?: string | null
          owner_profile_id?: string | null
          ownership_pct?: number | null
          related_company_id?: string | null
          relationship_type?: Database["public"]["Enums"]["company_relationship_type"]
          state?: Database["public"]["Enums"]["relationship_state"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_relationships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relationships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relationships_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relationships_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relationships_related_company_id_fkey"
            columns: ["related_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_relationships_related_company_id_fkey"
            columns: ["related_company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_sensitive: {
        Row: {
          cash_balance: number | null
          company_id: string
          investor_notes: string | null
          owner_profile_id: string | null
          ownership_notes: string | null
          parent_company_id: string | null
          revenue_monthly: number | null
          updated_at: string | null
          visibility: Database["public"]["Enums"]["visibility_level"] | null
        }
        Insert: {
          cash_balance?: number | null
          company_id: string
          investor_notes?: string | null
          owner_profile_id?: string | null
          ownership_notes?: string | null
          parent_company_id?: string | null
          revenue_monthly?: number | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Update: {
          cash_balance?: number | null
          company_id?: string
          investor_notes?: string | null
          owner_profile_id?: string | null
          ownership_notes?: string | null
          parent_company_id?: string | null
          revenue_monthly?: number | null
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "company_sensitive_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_sensitive_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_sensitive_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_sensitive_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_sensitive_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          analysis_error: string | null
          analysis_json: Json
          analysis_status: string
          analysis_summary: string | null
          analyzed_at: string | null
          category: string | null
          company_id: string | null
          company_match_confidence: number | null
          company_match_reason: string | null
          company_match_status: string
          created_at: string | null
          department_id: string | null
          editable_source_status: string | null
          extracted_text: string | null
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          original_filename: string | null
          project_id: string | null
          search_vector: unknown
          sensitivity: Database["public"]["Enums"]["visibility_level"] | null
          storage_path: string | null
          suggested_company_id: string | null
          summary: string | null
          title: string
          uploaded_by_profile_id: string | null
        }
        Insert: {
          analysis_error?: string | null
          analysis_json?: Json
          analysis_status?: string
          analysis_summary?: string | null
          analyzed_at?: string | null
          category?: string | null
          company_id?: string | null
          company_match_confidence?: number | null
          company_match_reason?: string | null
          company_match_status?: string
          created_at?: string | null
          department_id?: string | null
          editable_source_status?: string | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          project_id?: string | null
          search_vector?: unknown
          sensitivity?: Database["public"]["Enums"]["visibility_level"] | null
          storage_path?: string | null
          suggested_company_id?: string | null
          summary?: string | null
          title: string
          uploaded_by_profile_id?: string | null
        }
        Update: {
          analysis_error?: string | null
          analysis_json?: Json
          analysis_status?: string
          analysis_summary?: string | null
          analyzed_at?: string | null
          category?: string | null
          company_id?: string | null
          company_match_confidence?: number | null
          company_match_reason?: string | null
          company_match_status?: string
          created_at?: string | null
          department_id?: string | null
          editable_source_status?: string | null
          extracted_text?: string | null
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          original_filename?: string | null
          project_id?: string | null
          search_vector?: unknown
          sensitivity?: Database["public"]["Enums"]["visibility_level"] | null
          storage_path?: string | null
          suggested_company_id?: string | null
          summary?: string | null
          title?: string
          uploaded_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_suggested_company_id_fkey"
            columns: ["suggested_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_suggested_company_id_fkey"
            columns: ["suggested_company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_profile_id_fkey"
            columns: ["uploaded_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      engineering_drawings: {
        Row: {
          company_id: string | null
          created_at: string
          created_by_profile_id: string | null
          description: string
          dimensions_summary: string | null
          id: string
          notes: string | null
          svg_content: string
          title: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description: string
          dimensions_summary?: string | null
          id?: string
          notes?: string | null
          svg_content: string
          title: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by_profile_id?: string | null
          description?: string
          dimensions_summary?: string | null
          id?: string
          notes?: string | null
          svg_content?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "engineering_drawings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_drawings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engineering_drawings_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_reports: {
        Row: {
          cash_position: number | null
          company_id: string
          created_at: string | null
          created_by_profile_id: string | null
          document_id: string | null
          expenses: number | null
          health_status: Database["public"]["Enums"]["financial_health_status"]
          id: string
          net_income: number | null
          notable_flags: Json | null
          period: string | null
          revenue: number | null
          summary: string | null
        }
        Insert: {
          cash_position?: number | null
          company_id: string
          created_at?: string | null
          created_by_profile_id?: string | null
          document_id?: string | null
          expenses?: number | null
          health_status?: Database["public"]["Enums"]["financial_health_status"]
          id?: string
          net_income?: number | null
          notable_flags?: Json | null
          period?: string | null
          revenue?: number | null
          summary?: string | null
        }
        Update: {
          cash_position?: number | null
          company_id?: string
          created_at?: string | null
          created_by_profile_id?: string | null
          document_id?: string | null
          expenses?: number | null
          health_status?: Database["public"]["Enums"]["financial_health_status"]
          id?: string
          net_income?: number | null
          notable_flags?: Json | null
          period?: string | null
          revenue?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_reports_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      founder_notifications: {
        Row: {
          action_required: boolean
          agent_run_id: string | null
          body: string | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          id: string
          read_at: string | null
          resolved_at: string | null
          severity: string
          status: string
          title: string
          work_order_id: string | null
        }
        Insert: {
          action_required?: boolean
          agent_run_id?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          id?: string
          read_at?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
          work_order_id?: string | null
        }
        Update: {
          action_required?: boolean
          agent_run_id?: string | null
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          id?: string
          read_at?: string | null
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "founder_notifications_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founder_notifications_agent_run_id_fkey"
            columns: ["agent_run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "founder_notifications_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "canonical_work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_context: {
        Row: {
          content_md: string
          goal_id: string
          id: string
          updated_at: string
        }
        Insert: {
          content_md?: string
          goal_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          content_md?: string
          goal_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_context_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: true
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          actual_value: string | null
          company_id: string
          created_at: string
          created_by_profile_id: string | null
          cron_expr: string | null
          delta_label: string | null
          department_id: string | null
          description: string | null
          due_at: string | null
          id: string
          kind: Database["public"]["Enums"]["goal_kind"]
          metadata: Json
          owner_agent_id: string | null
          owner_person_id: string | null
          owner_type: string
          progress: number | null
          status: Database["public"]["Enums"]["goal_status"]
          target_value: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_value?: string | null
          company_id: string
          created_at?: string
          created_by_profile_id?: string | null
          cron_expr?: string | null
          delta_label?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["goal_kind"]
          metadata?: Json
          owner_agent_id?: string | null
          owner_person_id?: string | null
          owner_type?: string
          progress?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_value?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_value?: string | null
          company_id?: string
          created_at?: string
          created_by_profile_id?: string | null
          cron_expr?: string | null
          delta_label?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["goal_kind"]
          metadata?: Json
          owner_agent_id?: string | null
          owner_person_id?: string | null
          owner_type?: string
          progress?: number | null
          status?: Database["public"]["Enums"]["goal_status"]
          target_value?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goals_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_queue: {
        Row: {
          action: string
          approval_id: string | null
          company_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          id: string
          integration: string
          payload: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          action: string
          approval_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          id?: string
          integration: string
          payload?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          action?: string
          approval_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          id?: string
          integration?: string
          payload?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_queue_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_queue_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          company_id: string | null
          id: string
          location: string | null
          product_line_id: string | null
          quantity_on_hand: number | null
          reorder_point: number | null
          reserved_quantity: number | null
          sku: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          id?: string
          location?: string | null
          product_line_id?: string | null
          quantity_on_hand?: number | null
          reorder_point?: number | null
          reserved_quantity?: number | null
          sku?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          id?: string
          location?: string | null
          product_line_id?: string | null
          quantity_on_hand?: number | null
          reorder_point?: number | null
          reserved_quantity?: number | null
          sku?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          created_at: string
          current_value: string | null
          due_at: string | null
          goal_id: string
          id: string
          label: string
          target_value: string | null
          unit: string | null
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          current_value?: string | null
          due_at?: string | null
          goal_id: string
          id?: string
          label: string
          target_value?: string | null
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          current_value?: string | null
          due_at?: string | null
          goal_id?: string
          id?: string
          label?: string
          target_value?: string | null
          unit?: string | null
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "key_results_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_records: {
        Row: {
          actual: number | null
          bonus_amount: number | null
          company_id: string | null
          created_at: string | null
          id: string
          metric: string
          period: string
          person_id: string | null
          salary_impact_pct: number | null
          score: number | null
          status: string | null
          target: number | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          actual?: number | null
          bonus_amount?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          metric: string
          period: string
          person_id?: string | null
          salary_impact_pct?: number | null
          score?: number | null
          status?: string | null
          target?: number | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          actual?: number | null
          bonus_amount?: number | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          metric?: string
          period?: string
          person_id?: string | null
          salary_impact_pct?: number | null
          score?: number | null
          status?: string | null
          target?: number | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "kpi_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_connectors: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          enabled: boolean
          endpoint_url: string
          id: string
          last_checked_at: string | null
          last_status: string | null
          last_tool_count: number | null
          name: string
          transport: Database["public"]["Enums"]["mcp_transport"]
          vault_secret_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          enabled?: boolean
          endpoint_url: string
          id?: string
          last_checked_at?: string | null
          last_status?: string | null
          last_tool_count?: number | null
          name: string
          transport?: Database["public"]["Enums"]["mcp_transport"]
          vault_secret_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          enabled?: boolean
          endpoint_url?: string
          id?: string
          last_checked_at?: string | null
          last_status?: string | null
          last_tool_count?: number | null
          name?: string
          transport?: Database["public"]["Enums"]["mcp_transport"]
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mcp_connectors_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          company_id: string | null
          confidence: number | null
          created_at: string | null
          created_by_profile_id: string | null
          embedding: string | null
          entity_id: string | null
          entity_type: string
          fact: string
          id: string
          review_date: string | null
          sensitivity: Database["public"]["Enums"]["visibility_level"] | null
          source_id: string | null
          source_type: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          confidence?: number | null
          created_at?: string | null
          created_by_profile_id?: string | null
          embedding?: string | null
          entity_id?: string | null
          entity_type: string
          fact: string
          id?: string
          review_date?: string | null
          sensitivity?: Database["public"]["Enums"]["visibility_level"] | null
          source_id?: string | null
          source_type?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          confidence?: number | null
          created_at?: string | null
          created_by_profile_id?: string | null
          embedding?: string | null
          entity_id?: string | null
          entity_type?: string
          fact?: string
          id?: string
          review_date?: string | null
          sensitivity?: Database["public"]["Enums"]["visibility_level"] | null
          source_id?: string | null
          source_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      model_usage: {
        Row: {
          actual_cost_usd: number | null
          created_at: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          model_name: string | null
          output_tokens: number | null
          profile_id: string | null
          task_id: string | null
          work_order_id: string | null
        }
        Insert: {
          actual_cost_usd?: number | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          model_name?: string | null
          output_tokens?: number | null
          profile_id?: string | null
          task_id?: string | null
          work_order_id?: string | null
        }
        Update: {
          actual_cost_usd?: number | null
          created_at?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          model_name?: string | null
          output_tokens?: number | null
          profile_id?: string | null
          task_id?: string | null
          work_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "model_usage_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_usage_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_usage_work_order_id_fkey"
            columns: ["work_order_id"]
            isOneToOne: false
            referencedRelation: "work_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          active: boolean | null
          ai_manager_agent_id: string | null
          company_id: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          manager_person_id: string | null
          performance_score: number | null
          profile_id: string | null
          responsibilities: string | null
          role_title: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          ai_manager_agent_id?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          manager_person_id?: string | null
          performance_score?: number | null
          profile_id?: string | null
          responsibilities?: string | null
          role_title?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          ai_manager_agent_id?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          manager_person_id?: string | null
          performance_score?: number | null
          profile_id?: string | null
          responsibilities?: string | null
          role_title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_manager_person_id_fkey"
            columns: ["manager_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_ai_policy: {
        Row: {
          allowed_categories: Json
          fallback_sla_minutes: number | null
          id: string
          mode: string
          person_id: string
          updated_at: string | null
          updated_by_profile_id: string | null
        }
        Insert: {
          allowed_categories?: Json
          fallback_sla_minutes?: number | null
          id?: string
          mode?: string
          person_id: string
          updated_at?: string | null
          updated_by_profile_id?: string | null
        }
        Update: {
          allowed_categories?: Json
          fallback_sla_minutes?: number | null
          id?: string
          mode?: string
          person_id?: string
          updated_at?: string | null
          updated_by_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_ai_policy_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_ai_policy_updated_by_profile_id_fkey"
            columns: ["updated_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_assignments: {
        Row: {
          allocation_pct: number | null
          created_at: string | null
          created_by_profile_id: string | null
          department_id: string | null
          employment_type: Database["public"]["Enums"]["employment_type"] | null
          end_date: string | null
          id: string
          is_primary: boolean | null
          job_title: string | null
          legal_employer_company_id: string | null
          manager_person_id: string | null
          operating_company_id: string | null
          person_id: string
          responsibilities: string | null
          start_date: string | null
          state: Database["public"]["Enums"]["assignment_state"]
          updated_at: string | null
        }
        Insert: {
          allocation_pct?: number | null
          created_at?: string | null
          created_by_profile_id?: string | null
          department_id?: string | null
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          end_date?: string | null
          id?: string
          is_primary?: boolean | null
          job_title?: string | null
          legal_employer_company_id?: string | null
          manager_person_id?: string | null
          operating_company_id?: string | null
          person_id: string
          responsibilities?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["assignment_state"]
          updated_at?: string | null
        }
        Update: {
          allocation_pct?: number | null
          created_at?: string | null
          created_by_profile_id?: string | null
          department_id?: string | null
          employment_type?:
            | Database["public"]["Enums"]["employment_type"]
            | null
          end_date?: string | null
          id?: string
          is_primary?: boolean | null
          job_title?: string | null
          legal_employer_company_id?: string | null
          manager_person_id?: string | null
          operating_company_id?: string | null
          person_id?: string
          responsibilities?: string | null
          start_date?: string | null
          state?: Database["public"]["Enums"]["assignment_state"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_assignments_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_legal_employer_company_id_fkey"
            columns: ["legal_employer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_legal_employer_company_id_fkey"
            columns: ["legal_employer_company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_manager_person_id_fkey"
            columns: ["manager_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_operating_company_id_fkey"
            columns: ["operating_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_operating_company_id_fkey"
            columns: ["operating_company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_assignments_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_components: {
        Row: {
          approved_at: string | null
          approved_by_profile_id: string | null
          capability_metadata: Json
          component_type: string
          created_at: string
          definition_hash: string | null
          definition_path: string | null
          display_name: string | null
          enabled: boolean
          id: string
          install_status: string
          installed_version: string | null
          last_health_check_at: string | null
          last_health_status: string | null
          manifest: Json
          permission_profile: Json
          requires_approval: boolean
          slug: string
          source_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_profile_id?: string | null
          capability_metadata?: Json
          component_type: string
          created_at?: string
          definition_hash?: string | null
          definition_path?: string | null
          display_name?: string | null
          enabled?: boolean
          id?: string
          install_status?: string
          installed_version?: string | null
          last_health_check_at?: string | null
          last_health_status?: string | null
          manifest?: Json
          permission_profile?: Json
          requires_approval?: boolean
          slug: string
          source_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_profile_id?: string | null
          capability_metadata?: Json
          component_type?: string
          created_at?: string
          definition_hash?: string | null
          definition_path?: string | null
          display_name?: string | null
          enabled?: boolean
          id?: string
          install_status?: string
          installed_version?: string | null
          last_health_check_at?: string | null
          last_health_status?: string | null
          manifest?: Json
          permission_profile?: Json
          requires_approval?: boolean
          slug?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_components_approved_by_profile_id_fkey"
            columns: ["approved_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plugin_components_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "plugin_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      plugin_sources: {
        Row: {
          created_at: string
          created_by_profile_id: string | null
          default_branch: string
          github_owner: string
          github_repo: string
          id: string
          last_checked_at: string | null
          latest_upstream_sha: string | null
          license: string | null
          pinned_commit_sha: string | null
          pinned_ref: string | null
          repository_url: string
          source_type: string
          trust_status: string
          update_available: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_profile_id?: string | null
          default_branch?: string
          github_owner: string
          github_repo: string
          id?: string
          last_checked_at?: string | null
          latest_upstream_sha?: string | null
          license?: string | null
          pinned_commit_sha?: string | null
          pinned_ref?: string | null
          repository_url: string
          source_type?: string
          trust_status?: string
          update_available?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_profile_id?: string | null
          default_branch?: string
          github_owner?: string
          github_repo?: string
          id?: string
          last_checked_at?: string | null
          latest_upstream_sha?: string | null
          license?: string | null
          pinned_commit_sha?: string | null
          pinned_ref?: string | null
          repository_url?: string
          source_type?: string
          trust_status?: string
          update_available?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plugin_sources_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_costs: {
        Row: {
          product_line_id: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          product_line_id: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          product_line_id?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: true
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lines: {
        Row: {
          active: boolean | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          delivery_timeline: string | null
          description: string | null
          id: string
          name: string
          service_fee_monthly: number | null
          unit_price: number | null
          updated_at: string | null
          warranty: string | null
        }
        Insert: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_timeline?: string | null
          description?: string | null
          id?: string
          name: string
          service_fee_monthly?: number | null
          unit_price?: number | null
          updated_at?: string | null
          warranty?: string | null
        }
        Update: {
          active?: boolean | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          delivery_timeline?: string | null
          description?: string | null
          id?: string
          name?: string
          service_fee_monthly?: number | null
          unit_price?: number | null
          updated_at?: string | null
          warranty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_specs: {
        Row: {
          body_md: string | null
          company_id: string | null
          created_at: string
          id: string
          owner_profile_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          owner_profile_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          owner_profile_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_specs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_specs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_specs_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          auth_user_id: string | null
          created_at: string
          default_company_id: string | null
          email: string | null
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          default_company_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_user_id?: string | null
          created_at?: string
          default_company_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          blockers: string | null
          company_id: string
          created_at: string | null
          deadline: string | null
          goal: string | null
          id: string
          owner_person_id: string | null
          risk_score: number | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          blockers?: string | null
          company_id: string
          created_at?: string | null
          deadline?: string | null
          goal?: string | null
          id?: string
          owner_person_id?: string | null
          risk_score?: number | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          blockers?: string | null
          company_id?: string
          created_at?: string | null
          deadline?: string | null
          goal?: string | null
          id?: string
          owner_person_id?: string | null
          risk_score?: number | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_financials: {
        Row: {
          internal_margin: number | null
          proposal_id: string
          updated_at: string | null
        }
        Insert: {
          internal_margin?: number | null
          proposal_id: string
          updated_at?: string | null
        }
        Update: {
          internal_margin?: number | null
          proposal_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_financials_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_financials_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: true
            referencedRelation: "safe_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_item_costs: {
        Row: {
          proposal_item_id: string
          unit_cost: number | null
          updated_at: string | null
        }
        Insert: {
          proposal_item_id: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Update: {
          proposal_item_id?: string
          unit_cost?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_item_costs_proposal_item_id_fkey"
            columns: ["proposal_item_id"]
            isOneToOne: true
            referencedRelation: "proposal_items"
            referencedColumns: ["id"]
          },
        ]
      }
      proposal_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          line_total: number | null
          product_line_id: string | null
          proposal_id: string | null
          quantity: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          line_total?: number | null
          product_line_id?: string | null
          proposal_id?: string | null
          quantity?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          line_total?: number | null
          product_line_id?: string | null
          proposal_id?: string | null
          quantity?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposal_items_product_line_id_fkey"
            columns: ["product_line_id"]
            isOneToOne: false
            referencedRelation: "product_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposal_items_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "safe_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          currency: string | null
          discount_pct: number | null
          id: string
          language: string | null
          lead_id: string | null
          payment_terms: string | null
          status: string | null
          subtotal: number | null
          title: string
          total: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          currency?: string | null
          discount_pct?: number | null
          id?: string
          language?: string | null
          lead_id?: string | null
          payment_terms?: string | null
          status?: string | null
          subtotal?: number | null
          title: string
          total?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          currency?: string | null
          discount_pct?: number | null
          id?: string
          language?: string | null
          lead_id?: string | null
          payment_terms?: string | null
          status?: string | null
          subtotal?: number | null
          title?: string
          total?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_private: {
        Row: {
          base_salary: number | null
          compensation_notes: string | null
          currency: string | null
          person_id: string
          updated_at: string | null
          visibility: Database["public"]["Enums"]["visibility_level"] | null
        }
        Insert: {
          base_salary?: number | null
          compensation_notes?: string | null
          currency?: string | null
          person_id: string
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Update: {
          base_salary?: number | null
          compensation_notes?: string | null
          currency?: string | null
          person_id?: string
          updated_at?: string | null
          visibility?: Database["public"]["Enums"]["visibility_level"] | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_private_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_rules: {
        Row: {
          active: boolean | null
          approval_required: boolean | null
          company_id: string | null
          created_at: string | null
          formula: Json | null
          id: string
          role_title: string | null
          rule_name: string
        }
        Insert: {
          active?: boolean | null
          approval_required?: boolean | null
          company_id?: string | null
          created_at?: string | null
          formula?: Json | null
          id?: string
          role_title?: string | null
          rule_name: string
        }
        Update: {
          active?: boolean | null
          approval_required?: boolean | null
          company_id?: string | null
          created_at?: string | null
          formula?: Json | null
          id?: string
          role_title?: string | null
          rule_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_leads: {
        Row: {
          client_name: string
          company_id: string | null
          contact_email: string | null
          contact_name: string | null
          created_at: string | null
          id: string
          next_action: string | null
          owner_person_id: string | null
          stage: string | null
          status: string | null
          updated_at: string | null
          value_estimate: number | null
        }
        Insert: {
          client_name: string
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          next_action?: string | null
          owner_person_id?: string | null
          stage?: string | null
          status?: string | null
          updated_at?: string | null
          value_estimate?: number | null
        }
        Update: {
          client_name?: string
          company_id?: string | null
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string | null
          id?: string
          next_action?: string | null
          owner_person_id?: string | null
          stage?: string | null
          status?: string | null
          updated_at?: string | null
          value_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_leads_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      service_credit_ledger: {
        Row: {
          amount: number
          billing_account_id: string
          created_at: string | null
          created_by_profile_id: string | null
          description: string | null
          entry_type: string
          id: string
          related_model_usage_id: string | null
        }
        Insert: {
          amount: number
          billing_account_id: string
          created_at?: string | null
          created_by_profile_id?: string | null
          description?: string | null
          entry_type: string
          id?: string
          related_model_usage_id?: string | null
        }
        Update: {
          amount?: number
          billing_account_id?: string
          created_at?: string | null
          created_by_profile_id?: string | null
          description?: string | null
          entry_type?: string
          id?: string
          related_model_usage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_credit_ledger_billing_account_id_fkey"
            columns: ["billing_account_id"]
            isOneToOne: false
            referencedRelation: "billing_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_credit_ledger_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_credit_ledger_related_model_usage_id_fkey"
            columns: ["related_model_usage_id"]
            isOneToOne: true
            referencedRelation: "model_usage"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          acceptance_criteria: Json | null
          approval_required: boolean | null
          canonical_work_order_id: string | null
          company_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          deadline: string | null
          depends_on: string[]
          description: string | null
          expected_output: Json | null
          id: string
          input: Json | null
          owner_agent_id: string | null
          owner_person_id: string | null
          owner_type: string
          parallel_group: string | null
          parent_goal: string | null
          parent_task_id: string | null
          previous_status: Database["public"]["Enums"]["work_status"] | null
          priority: Database["public"]["Enums"]["priority_level"] | null
          project_id: string | null
          required_capabilities: string[]
          risk_level: Database["public"]["Enums"]["risk_level"] | null
          source: string | null
          status: Database["public"]["Enums"]["work_status"] | null
          test_method: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          acceptance_criteria?: Json | null
          approval_required?: boolean | null
          canonical_work_order_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          deadline?: string | null
          depends_on?: string[]
          description?: string | null
          expected_output?: Json | null
          id?: string
          input?: Json | null
          owner_agent_id?: string | null
          owner_person_id?: string | null
          owner_type?: string
          parallel_group?: string | null
          parent_goal?: string | null
          parent_task_id?: string | null
          previous_status?: Database["public"]["Enums"]["work_status"] | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          project_id?: string | null
          required_capabilities?: string[]
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          source?: string | null
          status?: Database["public"]["Enums"]["work_status"] | null
          test_method?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          acceptance_criteria?: Json | null
          approval_required?: boolean | null
          canonical_work_order_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          deadline?: string | null
          depends_on?: string[]
          description?: string | null
          expected_output?: Json | null
          id?: string
          input?: Json | null
          owner_agent_id?: string | null
          owner_person_id?: string | null
          owner_type?: string
          parallel_group?: string | null
          parent_goal?: string | null
          parent_task_id?: string | null
          previous_status?: Database["public"]["Enums"]["work_status"] | null
          priority?: Database["public"]["Enums"]["priority_level"] | null
          project_id?: string | null
          required_capabilities?: string[]
          risk_level?: Database["public"]["Enums"]["risk_level"] | null
          source?: string | null
          status?: Database["public"]["Enums"]["work_status"] | null
          test_method?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_canonical_work_order_id_fkey"
            columns: ["canonical_work_order_id"]
            isOneToOne: false
            referencedRelation: "canonical_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_agent_id_fkey"
            columns: ["owner_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_owner_person_id_fkey"
            columns: ["owner_person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          assigned_agent_id: string | null
          canonical_work_order_id: string | null
          channel_id: string | null
          command: string
          company_id: string | null
          context_pack: Json | null
          cost_estimate_usd: number | null
          created_at: string | null
          created_by_profile_id: string | null
          id: string
          output: Json | null
          status: Database["public"]["Enums"]["work_status"] | null
          token_estimate: number | null
          updated_at: string | null
        }
        Insert: {
          assigned_agent_id?: string | null
          canonical_work_order_id?: string | null
          channel_id?: string | null
          command: string
          company_id?: string | null
          context_pack?: Json | null
          cost_estimate_usd?: number | null
          created_at?: string | null
          created_by_profile_id?: string | null
          id?: string
          output?: Json | null
          status?: Database["public"]["Enums"]["work_status"] | null
          token_estimate?: number | null
          updated_at?: string | null
        }
        Update: {
          assigned_agent_id?: string | null
          canonical_work_order_id?: string | null
          channel_id?: string | null
          command?: string
          company_id?: string | null
          context_pack?: Json | null
          cost_estimate_usd?: number | null
          created_at?: string | null
          created_by_profile_id?: string | null
          id?: string
          output?: Json | null
          status?: Database["public"]["Enums"]["work_status"] | null
          token_estimate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_assigned_agent_id_fkey"
            columns: ["assigned_agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_canonical_work_order_id_fkey"
            columns: ["canonical_work_order_id"]
            isOneToOne: false
            referencedRelation: "canonical_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_runs_with_live_status: {
        Row: {
          agent_definition_hash: string | null
          agent_definition_path: string | null
          agent_id: string | null
          attached_skills: Json | null
          base_commit: string | null
          blocked_reason: string | null
          branch: string | null
          canonical_work_order_id: string | null
          company_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          current_step: string | null
          error: string | null
          estimated_cost_usd: number | null
          execution_provider: string | null
          finished_at: string | null
          head_commit: string | null
          id: string | null
          last_event: string | null
          last_heartbeat_at: string | null
          live_run_status: string | null
          provider_run_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["work_status"] | null
          summary: string | null
          task_id: string | null
          token_usage: Json | null
          updated_at: string | null
          verification_status: string | null
          worker_id: string | null
          worktree_path: string | null
        }
        Insert: {
          agent_definition_hash?: string | null
          agent_definition_path?: string | null
          agent_id?: string | null
          attached_skills?: Json | null
          base_commit?: string | null
          blocked_reason?: string | null
          branch?: string | null
          canonical_work_order_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          current_step?: string | null
          error?: string | null
          estimated_cost_usd?: number | null
          execution_provider?: string | null
          finished_at?: string | null
          head_commit?: string | null
          id?: string | null
          last_event?: string | null
          last_heartbeat_at?: string | null
          live_run_status?: never
          provider_run_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_status"] | null
          summary?: string | null
          task_id?: string | null
          token_usage?: Json | null
          updated_at?: string | null
          verification_status?: string | null
          worker_id?: string | null
          worktree_path?: string | null
        }
        Update: {
          agent_definition_hash?: string | null
          agent_definition_path?: string | null
          agent_id?: string | null
          attached_skills?: Json | null
          base_commit?: string | null
          blocked_reason?: string | null
          branch?: string | null
          canonical_work_order_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          current_step?: string | null
          error?: string | null
          estimated_cost_usd?: number | null
          execution_provider?: string | null
          finished_at?: string | null
          head_commit?: string | null
          id?: string | null
          last_event?: string | null
          last_heartbeat_at?: string | null
          live_run_status?: never
          provider_run_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["work_status"] | null
          summary?: string | null
          task_id?: string | null
          token_usage?: Json | null
          updated_at?: string | null
          verification_status?: string | null
          worker_id?: string | null
          worktree_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents_with_live_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_canonical_work_order_id_fkey"
            columns: ["canonical_work_order_id"]
            isOneToOne: false
            referencedRelation: "canonical_work_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agents_with_live_status: {
        Row: {
          active: boolean | null
          allowed_tools: Json | null
          capabilities: string[] | null
          category: string | null
          cost_limit_usd: number | null
          created_at: string | null
          definition_hash: string | null
          definition_path: string | null
          description: string | null
          display_name: string | null
          execution_provider: string | null
          forbidden_actions: Json | null
          has_production_authority: boolean | null
          id: string | null
          last_run_at: string | null
          last_run_head_commit: string | null
          last_run_id: string | null
          last_run_provider_run_id: string | null
          last_run_status: Database["public"]["Enums"]["work_status"] | null
          last_run_summary: string | null
          live_status: string | null
          name: string | null
          permission_mode: string | null
          provenance: Json | null
          role: string | null
          skills: Json | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          allowed_tools?: Json | null
          capabilities?: string[] | null
          category?: string | null
          cost_limit_usd?: number | null
          created_at?: string | null
          definition_hash?: string | null
          definition_path?: string | null
          description?: string | null
          display_name?: string | null
          execution_provider?: string | null
          forbidden_actions?: Json | null
          has_production_authority?: boolean | null
          id?: string | null
          last_run_at?: never
          last_run_head_commit?: never
          last_run_id?: never
          last_run_provider_run_id?: never
          last_run_status?: never
          last_run_summary?: never
          live_status?: never
          name?: string | null
          permission_mode?: string | null
          provenance?: Json | null
          role?: string | null
          skills?: Json | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          allowed_tools?: Json | null
          capabilities?: string[] | null
          category?: string | null
          cost_limit_usd?: number | null
          created_at?: string | null
          definition_hash?: string | null
          definition_path?: string | null
          description?: string | null
          display_name?: string | null
          execution_provider?: string | null
          forbidden_actions?: Json | null
          has_production_authority?: boolean | null
          id?: string | null
          last_run_at?: never
          last_run_head_commit?: never
          last_run_id?: never
          last_run_provider_run_id?: never
          last_run_status?: never
          last_run_summary?: never
          live_status?: never
          name?: string | null
          permission_mode?: string | null
          provenance?: Json | null
          role?: string | null
          skills?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      safe_companies: {
        Row: {
          country: string | null
          created_at: string | null
          description: string | null
          id: string | null
          legal_entity_name: string | null
          name: string | null
          risk_score: number | null
          status: string | null
          strategic_priority: number | null
          updated_at: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          legal_entity_name?: string | null
          name?: string | null
          risk_score?: number | null
          status?: string | null
          strategic_priority?: number | null
          updated_at?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          legal_entity_name?: string | null
          name?: string | null
          risk_score?: number | null
          status?: string | null
          strategic_priority?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      safe_proposals: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by_profile_id: string | null
          currency: string | null
          discount_pct: number | null
          id: string | null
          language: string | null
          lead_id: string | null
          payment_terms: string | null
          status: string | null
          subtotal: number | null
          title: string | null
          total: number | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          currency?: string | null
          discount_pct?: number | null
          id?: string | null
          language?: string | null
          lead_id?: string | null
          payment_terms?: string | null
          status?: string | null
          subtotal?: number | null
          title?: string | null
          total?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by_profile_id?: string | null
          currency?: string | null
          discount_pct?: number | null
          id?: string | null
          language?: string | null
          lead_id?: string | null
          payment_terms?: string | null
          status?: string | null
          subtotal?: number | null
          title?: string | null
          total?: number | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "safe_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "sales_leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      archive_company: { Args: { p_company_id: string }; Returns: Json }
      archive_goal: { Args: { p_goal_id: string }; Returns: Json }
      archive_task: { Args: { p_task_id: string }; Returns: Json }
      can_manage_board_item: {
        Args: { p_board_id: string; p_task_id: string }
        Returns: boolean
      }
      check_person_delete_dependents: {
        Args: { p_person_id: string }
        Returns: Json
      }
      complete_agent_run: {
        Args: {
          p_agent_run_id: string
          p_head_commit?: string
          p_status: Database["public"]["Enums"]["work_status"]
          p_summary?: string
          p_verification_status?: string
        }
        Returns: Json
      }
      complete_work_order: {
        Args: { p_summary?: string; p_work_order_id: string }
        Returns: Json
      }
      create_board_task: {
        Args: {
          p_board_id: string
          p_column_id: string
          p_deadline?: string
          p_description?: string
          p_owner_person_id?: string
          p_priority?: Database["public"]["Enums"]["priority_level"]
          p_title: string
        }
        Returns: string
      }
      create_board_with_defaults: {
        Args: { p_company_id: string; p_description?: string; p_name: string }
        Returns: string
      }
      create_factory_task: {
        Args: {
          p_acceptance_criteria?: Json
          p_description?: string
          p_owner_agent_id?: string
          p_title: string
          p_work_order_id: string
        }
        Returns: string
      }
      create_factory_work_order: {
        Args: {
          p_acceptance_criteria?: Json
          p_company_id: string
          p_goal_id?: string
          p_objective: string
          p_priority?: string
          p_title: string
          p_work_type?: string
        }
        Returns: string
      }
      create_founder_notification: {
        Args: {
          p_action_required?: boolean
          p_agent_run_id: string
          p_body: string
          p_dedupe_key: string
          p_event_type: string
          p_severity: string
          p_title: string
          p_work_order_id: string
        }
        Returns: string
      }
      create_mcp_connector_secret: {
        Args: { p_name: string; p_secret: string }
        Returns: string
      }
      create_pending_work_order: {
        Args: { p_channel_id?: string; p_command: string; p_context_pack: Json }
        Returns: string
      }
      current_profile_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      decide_approval: {
        Args: {
          p_approval_id: string
          p_decision: Database["public"]["Enums"]["approval_status"]
          p_decision_notes?: string
        }
        Returns: {
          decided: boolean
          deletion_summary: string
          task_resumed: boolean
        }[]
      }
      delete_mcp_connector_secret: {
        Args: { p_secret_id: string }
        Returns: undefined
      }
      delete_person: { Args: { p_person_id: string }; Returns: Json }
      end_person_employment: {
        Args: { p_end_date?: string; p_person_id: string }
        Returns: Json
      }
      get_effectively_active_companies: {
        Args: never
        Returns: {
          id: string
          name: string
          status: string
        }[]
      }
      get_mcp_connector_token: {
        Args: { p_connector_id: string }
        Returns: string
      }
      has_company_access: { Args: { cid: string }; Returns: boolean }
      is_company_effectively_active: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      is_company_manager: { Args: { cid: string }; Returns: boolean }
      is_founder_or_admin: { Args: never; Returns: boolean }
      is_hr_finance: { Args: never; Returns: boolean }
      is_investor_viewer_of: { Args: { cid: string }; Returns: boolean }
      mark_founder_notification_read: { Args: { p_id: string }; Returns: Json }
      mark_work_order_failed: {
        Args: { p_error: string; p_work_order_id: string }
        Returns: undefined
      }
      match_memories: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          company_id: string
          confidence: number
          entity_id: string
          entity_type: string
          fact: string
          id: string
          sensitivity: Database["public"]["Enums"]["visibility_level"]
          similarity: number
        }[]
      }
      move_board_item: {
        Args: {
          p_item_id: string
          p_position?: number
          p_target_column_id: string
        }
        Returns: undefined
      }
      permanently_delete_fixture_company_graph: {
        Args: { p_company_id: string }
        Returns: Json
      }
      propose_salary_change: {
        Args: {
          p_base_salary: number
          p_compensation_notes?: string
          p_currency?: string
          p_person_id: string
        }
        Returns: string
      }
      resolve_founder_notification: { Args: { p_id: string }; Returns: Json }
      restore_company: { Args: { p_company_id: string }; Returns: Json }
      restore_goal: { Args: { p_goal_id: string }; Returns: Json }
      restore_person_employment: {
        Args: { p_person_id: string }
        Returns: Json
      }
      restore_task: { Args: { p_task_id: string }; Returns: Json }
      search_artifacts: {
        Args: { p_company_id?: string; p_limit?: number; p_query: string }
        Returns: {
          analysis_json: Json
          analysis_status: string
          analysis_summary: string
          category: string
          company_id: string
          company_match_confidence: number
          company_match_status: string
          created_at: string
          extracted_text: string
          id: string
          mime_type: string
          rank: number
          sensitivity: Database["public"]["Enums"]["visibility_level"]
          suggested_company_id: string
          summary: string
          title: string
        }[]
      }
      sem_execute_ai_command: {
        Args: {
          p_approvals: Json
          p_command: string
          p_companies?: Json
          p_company_relationships?: Json
          p_context_pack: Json
          p_deleted_task_ids?: string[]
          p_estimated_cost_usd: number
          p_goals?: Json
          p_input_tokens: number
          p_memory_candidates?: Json
          p_model_name: string
          p_output: Json
          p_output_tokens: number
          p_people?: Json
          p_person_assignments?: Json
          p_primary_company_id?: string
          p_projects?: Json
          p_tasks: Json
          p_token_estimate: number
          p_work_order_id?: string
        }
        Returns: Json
      }
      set_channel_company_id: {
        Args: { p_channel_id: string; p_company_id: string }
        Returns: undefined
      }
      set_company_relationship: {
        Args: {
          p_company_id: string
          p_ownership_pct?: number
          p_related_company_id: string
          p_relationship_type: Database["public"]["Enums"]["company_relationship_type"]
          p_state?: string
        }
        Returns: string
      }
      set_person_assignment: {
        Args: {
          p_allocation_pct?: number
          p_department_id?: string
          p_employment_type?: string
          p_is_primary?: boolean
          p_job_title?: string
          p_legal_employer_company_id?: string
          p_manager_person_id?: string
          p_operating_company_id: string
          p_person_id: string
          p_responsibilities?: string
          p_state?: string
        }
        Returns: string
      }
      try_uuid: { Args: { t: string }; Returns: string }
      validate_organization_graph: {
        Args: { p_company_id?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "founder"
        | "holding_admin"
        | "hr_finance"
        | "company_manager"
        | "team_lead"
        | "employee"
        | "contractor"
        | "investor_viewer"
        | "ai_agent"
      approval_domain:
        | "general"
        | "salary_hr"
        | "finance"
        | "legal"
        | "production"
        | "external_comms"
      approval_status:
        | "pending"
        | "approved"
        | "rejected"
        | "changes_requested"
        | "cancelled"
      assignment_state: "current" | "planned" | "historical"
      company_relationship_type:
        | "parent_of"
        | "owned_by_percentage"
        | "business_unit_of"
        | "brand_of"
        | "subsidiary_of"
        | "department_of"
      employment_type: "full_time" | "part_time" | "contractor" | "advisor"
      financial_health_status: "healthy" | "watch" | "at_risk" | "unknown"
      goal_kind: "ephemeral" | "standing" | "routine" | "decision"
      goal_status: "draft" | "active" | "paused" | "achieved" | "archived"
      mcp_transport: "http" | "sse"
      priority_level: "low" | "medium" | "high" | "critical"
      relationship_state:
        | "current"
        | "planned"
        | "historical"
        | "under_restructuring"
      risk_level: "low" | "medium" | "high" | "critical"
      visibility_level:
        | "public"
        | "internal"
        | "confidential"
        | "restricted"
        | "founder_only"
      work_status:
        | "draft"
        | "queued"
        | "in_progress"
        | "blocked"
        | "needs_approval"
        | "qa_review"
        | "done"
        | "rejected"
        | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "founder",
        "holding_admin",
        "hr_finance",
        "company_manager",
        "team_lead",
        "employee",
        "contractor",
        "investor_viewer",
        "ai_agent",
      ],
      approval_domain: [
        "general",
        "salary_hr",
        "finance",
        "legal",
        "production",
        "external_comms",
      ],
      approval_status: [
        "pending",
        "approved",
        "rejected",
        "changes_requested",
        "cancelled",
      ],
      assignment_state: ["current", "planned", "historical"],
      company_relationship_type: [
        "parent_of",
        "owned_by_percentage",
        "business_unit_of",
        "brand_of",
        "subsidiary_of",
        "department_of",
      ],
      employment_type: ["full_time", "part_time", "contractor", "advisor"],
      financial_health_status: ["healthy", "watch", "at_risk", "unknown"],
      goal_kind: ["ephemeral", "standing", "routine", "decision"],
      goal_status: ["draft", "active", "paused", "achieved", "archived"],
      mcp_transport: ["http", "sse"],
      priority_level: ["low", "medium", "high", "critical"],
      relationship_state: [
        "current",
        "planned",
        "historical",
        "under_restructuring",
      ],
      risk_level: ["low", "medium", "high", "critical"],
      visibility_level: [
        "public",
        "internal",
        "confidential",
        "restricted",
        "founder_only",
      ],
      work_status: [
        "draft",
        "queued",
        "in_progress",
        "blocked",
        "needs_approval",
        "qa_review",
        "done",
        "rejected",
        "archived",
      ],
    },
  },
} as const
