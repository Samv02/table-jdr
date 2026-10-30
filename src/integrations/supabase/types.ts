export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      character_notes: {
        Row: {
          body: string;
          character_id: string;
          updated_at: string;
        };
        Insert: {
          body?: string;
          character_id: string;
          updated_at?: string;
        };
        Update: {
          body?: string;
          character_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "character_notes_character_id_fkey";
            columns: ["character_id"];
            isOneToOne: true;
            referencedRelation: "characters";
            referencedColumns: ["id"];
          },
        ];
      };
      character_state: {
        Row: {
          ammo: Json;
          character_id: string;
          eddies: number;
          hp_current: number;
          inventory: Json;
          program_slots: number;
          programs: Json;
          updated_at: string;
        };
        Insert: {
          ammo?: Json;
          character_id: string;
          eddies?: number;
          hp_current?: number;
          inventory?: Json;
          program_slots?: number;
          programs?: Json;
          updated_at?: string;
        };
        Update: {
          ammo?: Json;
          character_id?: string;
          eddies?: number;
          hp_current?: number;
          inventory?: Json;
          program_slots?: number;
          programs?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "character_state_character_id_fkey";
            columns: ["character_id"];
            isOneToOne: true;
            referencedRelation: "characters";
            referencedColumns: ["id"];
          },
        ];
      };
      characters: {
        Row: {
          created_at: string;
          handle: string | null;
          id: string;
          name: string;
          owner_id: string | null;
          players_can_edit: boolean;
          sheet: Json;
        };
        Insert: {
          created_at?: string;
          handle?: string | null;
          id?: string;
          name: string;
          owner_id?: string | null;
          players_can_edit?: boolean;
          sheet?: Json;
        };
        Update: {
          created_at?: string;
          handle?: string | null;
          id?: string;
          name?: string;
          owner_id?: string | null;
          players_can_edit?: boolean;
          sheet?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "characters_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      holo_links: {
        Row: {
          a: string;
          b: string;
          created_at: string;
        };
        Insert: {
          a: string;
          b: string;
          created_at?: string;
        };
        Update: {
          a?: string;
          b?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "holo_links_a_fkey";
            columns: ["a"];
            isOneToOne: false;
            referencedRelation: "characters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "holo_links_b_fkey";
            columns: ["b"];
            isOneToOne: false;
            referencedRelation: "characters";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          channel: string;
          created_at: string;
          id: string;
          sender_character: string | null;
          sender_name: string;
          sender_user: string;
        };
        Insert: {
          body: string;
          channel: string;
          created_at?: string;
          id?: string;
          sender_character?: string | null;
          sender_name?: string;
          sender_user?: string;
        };
        Update: {
          body?: string;
          channel?: string;
          created_at?: string;
          id?: string;
          sender_character?: string | null;
          sender_name?: string;
          sender_user?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_sender_character_fkey";
            columns: ["sender_character"];
            isOneToOne: false;
            referencedRelation: "characters";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          color: string;
          created_at: string;
          id: string;
          role: string;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          color?: string;
          created_at?: string;
          id: string;
          role?: string;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          color?: string;
          created_at?: string;
          id?: string;
          role?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      rolls: {
        Row: {
          author_name: string | null;
          character_id: string | null;
          character_name: string | null;
          created_at: string;
          dice_count: number;
          dice_sides: number;
          display_name: string | null;
          id: string;
          is_secret: boolean;
          label: string | null;
          modifier: number;
          results: number[];
          target: number | null;
          total: number;
          user_id: string;
        };
        Insert: {
          author_name?: string | null;
          character_id?: string | null;
          character_name?: string | null;
          created_at?: string;
          dice_count: number;
          dice_sides: number;
          display_name?: string | null;
          id?: string;
          is_secret?: boolean;
          label?: string | null;
          modifier?: number;
          results: number[];
          target?: number | null;
          total: number;
          user_id: string;
        };
        Update: {
          author_name?: string | null;
          character_id?: string | null;
          character_name?: string | null;
          created_at?: string;
          dice_count?: number;
          dice_sides?: number;
          display_name?: string | null;
          id?: string;
          is_secret?: boolean;
          label?: string | null;
          modifier?: number;
          results?: number[];
          target?: number | null;
          total?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rolls_character_id_fkey";
            columns: ["character_id"];
            isOneToOne: false;
            referencedRelation: "characters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rolls_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      scenes: {
        Row: {
          created_at: string;
          id: string;
          image_path: string;
          name: string;
          sort_order: number;
          subtitle: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          image_path: string;
          name: string;
          sort_order?: number;
          subtitle?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          image_path?: string;
          name?: string;
          sort_order?: number;
          subtitle?: string;
        };
        Relationships: [];
      };
      session_state: {
        Row: {
          active_scene_id: string | null;
          id: number;
          music: Json;
          universe: Json;
          updated_at: string;
        };
        Insert: {
          active_scene_id?: string | null;
          id?: number;
          music?: Json;
          universe?: Json;
          updated_at?: string;
        };
        Update: {
          active_scene_id?: string | null;
          id?: number;
          music?: Json;
          universe?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_state_active_scene_id_fkey";
            columns: ["active_scene_id"];
            isOneToOne: false;
            referencedRelation: "scenes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_post_channel: { Args: { ch: string }; Returns: boolean };
      can_read_channel: { Args: { ch: string }; Returns: boolean };
      get_universe: { Args: never; Returns: Json };
      get_party: {
        Args: never;
        Returns: {
          avatar_url: string;
          character_id: string;
          color: string;
          handle: string;
        }[];
      };
      holo_allowed: { Args: { _x: string; _y: string }; Returns: boolean };
      is_gm: { Args: never; Returns: boolean };
      owns_character: { Args: { _cid: string }; Returns: boolean };
      player_can_edit: { Args: { _cid: string }; Returns: boolean };
      set_table_music: { Args: { payload: Json }; Returns: Json };
      set_user_role: {
        Args: { _role: string; _user: string };
        Returns: undefined;
      };
      table_server_time: { Args: never; Returns: string };
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

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
