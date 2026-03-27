export interface ProcessRequest {
  job_id?: string;
  conversation_id: string;
  message_id?: string;
  bot_id: string;
  message?: string | { text?: string; message?: string };
}

export interface EngineReply {
  type: string;
  text?: string;
}

export interface ProcessResponse {
  status: "ok" | "error";
  replies: EngineReply[];
  waitingInput: boolean;
  waitingAgent: boolean;
  state?: any;
}
