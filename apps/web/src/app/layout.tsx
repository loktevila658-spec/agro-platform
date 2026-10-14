import type { ReactNode } from 'react';

export const metadata = { title: 'AgroPlatform web shell' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
