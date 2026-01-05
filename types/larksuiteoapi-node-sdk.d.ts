/**
 * Lightweight type shim for @larksuiteoapi/node-sdk
 * 
 * Purpose: Reduce TSC memory usage by providing minimal types
 * instead of loading the full SDK type definitions (572MB peak memory).
 * 
 * Only includes types actually used in this project:
 * - Client, WSClient, EventDispatcher
 * - Domain, AppType enums
 * 
 * @see scripts/tsc-profile/run-profile.sh for memory profiling
 * @see feishu_assistant-kdev for context on TSC OOM issue
 */

declare module "@larksuiteoapi/node-sdk" {
  // Enums
  export enum Domain {
    Feishu = "https://open.feishu.cn",
    Lark = "https://open.larksuite.com",
  }

  export enum AppType {
    SelfBuild = 0,
    ISV = 1,
  }

  // Client configuration
  export interface ClientConfig {
    appId: string;
    appSecret: string;
    appType?: AppType;
    domain?: Domain;
    timeout?: number;
    disableTokenCache?: boolean;
  }

  // Client - simplified, only methods we use
  export class Client {
    constructor(config: ClientConfig);
    
    im: {
      message: {
        create(params: {
          params: { receive_id_type: string };
          data: {
            receive_id: string;
            msg_type: string;
            content: string;
            uuid?: string;
          };
        }): Promise<{ code: number; msg: string; data?: unknown; success?: () => boolean }>;
        
        reply(params: {
          path: { message_id: string };
          params?: { reply_in_thread?: boolean };
          data: {
            msg_type: string;
            content: string;
            uuid?: string;
          };
        }): Promise<{ code: number; msg: string; data?: unknown; success?: () => boolean }>;

        get(params: {
          path: { message_id: string };
        }): Promise<{ code: number; msg: string; data?: { items?: unknown[] }; success?: () => boolean }>;

        list(params: {
          params: {
            container_id_type: string;
            container_id: string;
            page_size?: number;
            page_token?: string;
          };
        }): Promise<{ code: number; msg: string; data?: { items?: unknown[]; page_token?: string }; success?: () => boolean }>;
      };
      
      chat: {
        get(params: {
          path: { chat_id: string };
        }): Promise<{ code: number; msg: string; data?: unknown; success?: () => boolean }>;
      };

      image: {
        create(params: {
          data: {
            image_type: string;
            image: Buffer | Blob;
          };
        }): Promise<{ code: number; msg: string; data?: { image_key?: string }; success?: () => boolean }>;
      };
    };

    docx: {
      document: {
        rawContent(params: {
          path: { document_id: string };
        }): Promise<{ code: number; msg: string; data?: { content?: string }; success?: () => boolean }>;

        get(params: {
          path: { document_id: string };
        }): Promise<{ code: number; msg: string; data?: unknown; success?: () => boolean }>;
      };
    };

    wiki: {
      space: {
        getNode(params: {
          params: { token: string };
        }): Promise<{ code: number; msg: string; data?: { node?: unknown }; success?: () => boolean }>;
      };
    };

    contact: {
      user: {
        get(params: {
          path: { user_id: string };
          params?: { user_id_type?: string };
        }): Promise<{ code: number; msg: string; data?: { user?: unknown }; success?: () => boolean }>;
      };
    };

    authen: {
      accessToken: {
        create(params: {
          data: {
            grant_type: string;
            code: string;
          };
        }): Promise<{ 
          code: number; 
          msg: string; 
          data?: { 
            access_token?: string;
            refresh_token?: string;
            token_type?: string;
            expires_in?: number;
            open_id?: string;
            user_id?: string;
          }; 
          success?: () => boolean 
        }>;
      };
      userInfo: {
        get(params: {
          headers?: { Authorization: string };
        }): Promise<{ code: number; msg: string; data?: unknown; success?: () => boolean }>;
      };
    };

    drive: {
      file: {
        subscribeFile(params: {
          path: { file_token: string };
          params: { file_type: string };
        }): Promise<{ code: number; msg: string; data?: unknown; success?: () => boolean }>;
      };
    };
  }

  // WSClient for WebSocket connections
  export interface WSClientConfig {
    appId: string;
    appSecret: string;
    domain?: Domain;
    autoReconnect?: boolean;
  }

  export class WSClient {
    constructor(config: WSClientConfig);
    start(options: { eventDispatcher: EventDispatcher }): Promise<void>;
  }

  // EventDispatcher for handling events
  export interface EventDispatcherConfig {
    encryptKey?: string;
    verificationToken?: string;
  }

  export interface EventData {
    schema?: string;
    header?: {
      event_id?: string;
      event_type?: string;
      create_time?: string;
      token?: string;
      app_id?: string;
      tenant_key?: string;
    };
    event?: Record<string, unknown>;
  }

  export class EventDispatcher {
    encryptKey?: string;
    constructor(config?: EventDispatcherConfig);
    register(handlers: Record<string, (data: EventData) => Promise<unknown> | unknown>): this;
    invoke(data: unknown): Promise<unknown>;
  }

  // Adapter functions
  export function adaptDefault(
    path: string,
    dispatcher: EventDispatcher,
    options?: { autoChallenge?: boolean }
  ): (req: unknown, res: unknown) => Promise<void>;

  // Card message helper
  export const messageCard: {
    defaultCard(options: { title: string; content: string }): string;
  };
}
