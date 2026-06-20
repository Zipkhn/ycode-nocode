/**
 * Seed Service
 *
 * Handles seeding the database with default data.
 * Runs after migrations complete.
 */

import { createPage, getPageBySlug } from '@/lib/repositories/pageRepository';
import { upsertDraftLayers } from '@/lib/repositories/pageLayersRepository';
import { DESIGN_SYSTEM_PAGE, DESIGN_SYSTEM_LAYERS } from '@/lib/templates/seed-design-system';

export interface SeedResult {
  success: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}

/**
 * Seed the default "Design System" page as a draft.
 * Idempotent: skips if a page with the same slug already exists.
 */
async function seedDesignSystemPage(): Promise<SeedResult> {
  try {
    const existing = await getPageBySlug(DESIGN_SYSTEM_PAGE.slug, { is_published: false });
    if (existing) {
      return { success: true, inserted: 0, skipped: 1 };
    }

    const page = await createPage({
      name: DESIGN_SYSTEM_PAGE.name,
      slug: DESIGN_SYSTEM_PAGE.slug,
      is_published: false,
    });

    await upsertDraftLayers(page.id, DESIGN_SYSTEM_LAYERS);

    return { success: true, inserted: 1, skipped: 0 };
  } catch (error) {
    return {
      success: false,
      inserted: 0,
      skipped: 0,
      error: error instanceof Error ? error.message : 'Failed to seed Design System page',
    };
  }
}

/**
 * Run all seed operations
 */
export async function runSeeds(): Promise<{ success: boolean; results: Record<string, SeedResult> }> {
  const results: Record<string, SeedResult> = {};

  results.designSystemPage = await seedDesignSystemPage();

  const success = Object.values(results).every(r => r.success);

  return { success, results };
}
