import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { CookieOptions } from '@supabase/ssr';
import { credentials } from '@/lib/credentials';
import { parseSupabaseConfig } from '@/lib/supabase-config-parser';
import { cookies } from 'next/headers';
import { noCache } from '@/lib/api-response';
import type { SupabaseConfig } from '@/types';

/**
 * GET /ycode/api/auth/session
 * 
 * Get current user session
 */
export async function GET(request: NextRequest) {
  try {
    const config = await credentials.get<SupabaseConfig>('supabase_config');

    if (!config) {
      return noCache(
        { error: 'Supabase not configured' },
        500
      );
    }

    const parsed = parseSupabaseConfig(config);
    const cookieStore = await cookies();

    const supabase = createServerClient(
      parsed.projectUrl,
      parsed.anonKey,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // Get session
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      return noCache(
        { error: error.message },
        401
      );
    }

    return noCache({
      data: {
        session,
        user: session?.user || null,
      },
    });
  } catch (error) {
    console.error('Session check failed:', error);
    
    return noCache(
      { error: 'Session check failed' },
      500
    );
  }
}
