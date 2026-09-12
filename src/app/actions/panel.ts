'use server';

import { ctx } from '@/lib/ctx';

export async function loadPanelLayout(): Promise<string[] | null> {
  const { supabase } = await ctx();
  const { data } = await supabase
    .from('column_layouts').select('columns').eq('view_key', 'deal_panel').maybeSingle();
  return Array.isArray(data?.columns) ? (data.columns as string[]) : null;
}
