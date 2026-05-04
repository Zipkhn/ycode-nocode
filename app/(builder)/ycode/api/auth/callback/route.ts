import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { CookieOptions } from '@supabase/ssr';
import { credentials } from '@/lib/credentials';
import { parseSupabaseConfig } from '@/lib/supabase-config-parser';
import { cookies } from 'next/headers';
import type { SupabaseConfig } from '@/types';

/**
 * GET /ycode/api/auth/callback
 * 
 * Handle OAuth callback from Supabase Auth
 * (For future OAuth implementation)
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    try {
      const config = await credentials.get<SupabaseConfig>('supabase_config');

      if (!config) {
        return NextResponse.redirect(
          new URL('/login?error=config', request.url)
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

      // Exchange code for session
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error('Auth callback error:', error);
        return NextResponse.redirect(
          new URL('/login?error=auth', request.url)
        );
      }

      // Redirect to builder
      return NextResponse.redirect(new URL('/ycode', request.url));
    } catch (error) {
      console.error('Auth callback failed:', error);
      return NextResponse.redirect(
        new URL('/login?error=server', request.url)
      );
    }
  }

  // No code provided - redirect to login
  return NextResponse.redirect(new URL('/login', request.url));
}
