import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
export const nativeAndroid =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
export const NativeBridge = registerPlugin<{
  request(options: {
    path: string;
    method: string;
    body?: unknown;
    headers?: Record<string, string>;
  }): Promise<{ status: number; data?: any; base64?: string; mime?: string }>;
  signInGoogle(): Promise<any>;
  openAttachment(options: { path: string }): Promise<void>;
  pushStatus(): Promise<{ granted: boolean }>;
  pushToken(): Promise<{ token: string; deviceKey: string }>;
  launchNotice(): Promise<any>;
  addListener(
    name: string,
    callback: (data: any) => void,
  ): Promise<PluginListenerHandle>;
}>("DelipinaNative");
