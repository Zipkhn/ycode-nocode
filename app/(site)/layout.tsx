import '@/app/globals.css';
import RootLayoutShell, { defaultMetadata } from '@/components/RootLayoutShell';
import { fetchGlobalPageSettings } from '@/lib/generate-page-metadata';
import { renderRootLayoutHeadCode } from '@/lib/parse-head-html';

export const metadata = defaultMetadata;

export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let headElements: React.ReactNode[] = [];

  // Cloud mode uses ISR with explicit tenantId — calling headers() here
  // would force all pages dynamic. Cloud injects global head code from PageRenderer instead.
  if (process.env.SKIP_SETUP !== 'true') {
    try {
      const globalSettings = await fetchGlobalPageSettings();
      if (globalSettings.globalCustomCodeHead) {
        headElements = renderRootLayoutHeadCode(globalSettings.globalCustomCodeHead);
      }
    } catch {
      // Supabase not configured — skip custom code
    }
  }

  return (
    <RootLayoutShell headElements={headElements}>
      {children}
    </RootLayoutShell>
  );
}
