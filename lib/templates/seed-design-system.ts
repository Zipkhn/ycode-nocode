import type { Layer } from '@/types';

/**
 * Auto-seed: default "Design System" page.
 *
 * Seeded as a DRAFT page on new project setup (see lib/services/seedService.ts).
 *
 * PLACEHOLDER content — to be replaced by the real layer tree extracted from the
 * builder (Phase 2). Kept as a valid Layer[] so the page renders out of the box.
 * Styling is driven by `classes` (the `design` mirror is omitted on purpose to
 * keep the placeholder lean; it is repopulated when the real tree is extracted).
 */

export const DESIGN_SYSTEM_PAGE = {
  name: 'Design System',
  slug: 'design-system',
} as const;

export const DESIGN_SYSTEM_LAYERS: Layer[] = [
  {
    id: 'body',
    name: 'body',
    classes: '',
    children: [
      {
        id: 'ds-section',
        name: 'section',
        customName: 'Design System',
        classes: 'flex flex-col items-center w-[100%] pt-[80px] pb-[80px]',
        children: [
          {
            id: 'ds-container',
            name: 'div',
            classes: 'flex flex-col max-w-[1280px] w-[100%] gap-[24px] pl-[32px] pr-[32px]',
            children: [
              {
                id: 'ds-title',
                name: 'heading',
                customName: 'Heading',
                classes: 'font-[700] tracking-[-0.02em] text-[56px] leading-[1.1] max-md:text-[36px]',
                settings: { tag: 'h1' },
                variables: {
                  text: {
                    type: 'dynamic_rich_text',
                    data: {
                      content: {
                        type: 'doc',
                        content: [
                          { type: 'paragraph', content: [{ type: 'text', text: 'Design System' }] },
                        ],
                      },
                    },
                  },
                },
                restrictions: { editText: true },
              },
            ],
          },
        ],
      },
    ],
  },
];
