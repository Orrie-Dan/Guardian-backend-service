export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  meta: Record<string, unknown>;
  error: string | null;
}
