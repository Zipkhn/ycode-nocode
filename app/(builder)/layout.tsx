import '@/app/globals.css';
import RootLayoutShell, { defaultMetadata } from '@/components/RootLayoutShell';

export const metadata = defaultMetadata;

export default function BuilderLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <RootLayoutShell>{children}</RootLayoutShell>;
}
