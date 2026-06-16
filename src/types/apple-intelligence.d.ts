declare module "tauri-plugin-apple-intelligence-api" {
  export interface AvailabilityStatus {
    available: boolean;
    reason?: string;
  }

  export function availability(): Promise<AvailabilityStatus>;
  export function generate(prompt: string): Promise<string>;
}
