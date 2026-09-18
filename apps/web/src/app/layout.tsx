import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { AppFrame } from '../components/auth/AppFrame';
import { AuthProvider } from '../components/auth/AuthProvider';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata = {
  title: 'B7 Solar — Plataforma de Gestão',
  description: 'Plataforma profissional de gestão de energia solar',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={sans.variable}>
      <body className={sans.className}>
        <AuthProvider>
          <AppFrame>{children}</AppFrame>
        </AuthProvider>
      </body>
    </html>
  );
}
