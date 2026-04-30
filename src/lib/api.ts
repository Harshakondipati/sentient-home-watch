import { supabase } from "@/integrations/supabase/client";

// Helper: invoke an edge function and surface friendly errors.
export async function callFn<T = any>(name: string, body?: any): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // Try to surface the function's JSON error if available
    const fnErr: any = (error as any).context?.body
      ? (() => { try { return JSON.parse((error as any).context.body); } catch { return null; } })()
      : null;
    const msg = fnErr?.error || error.message || `Failed to call ${name}`;
    throw new Error(msg);
  }
  return data as T;
}
