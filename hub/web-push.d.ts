// web-push 4.x ships no types. Only what hub/push.ts uses is declared here.
declare module 'web-push' {
  export interface VapidKeys {
    publicKey: string;
    privateKey: string;
  }

  export interface PushSubscriptionLike {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }

  export interface SendOptions {
    TTL?: number;
    timeout?: number;
    vapidDetails?: { subject: string; publicKey: string; privateKey: string };
  }

  export interface SendResult {
    statusCode: number;
  }

  export function sendNotification(subscription: PushSubscriptionLike, payload: string, options?: SendOptions): Promise<SendResult>;
  export function generateVAPIDKeys(): VapidKeys;
}
