// shared-types/src/botTypes.ts

export enum PlatformType {
  WHATSAPP = 'whatsapp',
  WEBSITE = 'website',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  TELEGRAM = 'telegram', // Added for integration
}

export type BotStatus =
  | "active"
  | "inactive"
  | "draft"

export interface Bot {
  id: string
  user_id: string
  bot_name: string
  platform: PlatformType // Crucial for filtering bots based on campaign platform
  description?: string | null
  status: BotStatus
  created_at: string
  updated_at?: string
}