import { PlatformType, InternalMessage } from '../../shared-types/src';
import { MessageAdapter } from '../common/messageAdapter';
import axios from 'axios';

export class TelegramAdapter extends MessageAdapter {
  private apiUrl: string;

  constructor(token: string) {
    super(PlatformType.TELEGRAM);
    this.apiUrl = `https://api.telegram.org/bot${token}`;
  }

  // Convert incoming Telegram JSON to our system's format
  toInternal(telegramData: any): InternalMessage {
    const message = telegramData.message;
    return {
      platform: PlatformType.TELEGRAM,
      external_id: message.from.id.toString(),
      contact_name: `${message.from.first_name} ${message.from.last_name || ''}`.trim(),
      content: {
        type: 'text',
        text: message.text,
      },
      timestamp: new Date(message.date * 1000),
    };
  }

  // Send message back to Telegram user
  async sendMessage(to: string, content: any): Promise<void> {
    await axios.post(`${this.apiUrl}/sendMessage`, {
      chat_id: to,
      text: content.text,
    });
  }
}