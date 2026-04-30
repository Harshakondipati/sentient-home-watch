import { supabase } from "@/integrations/supabase/client";

// Helper: invoke an edge function and surface friendly errors.
type FunctionError = Error & { context?: { body?: string } };

export async function callFn<T = unknown>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Try to surface the function's JSON error if available
    const functionError = error as FunctionError;
    const fnErr = functionError.context?.body
      ? (() => { try { return JSON.parse(functionError.context?.body ?? "{}") as { error?: string }; } catch { return null; } })()
      : null;
    const msg = fnErr?.error || error.message || `Failed to call ${name}`;
    throw new Error(msg);
  }
  return data as T;
}
