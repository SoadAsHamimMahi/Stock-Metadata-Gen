import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import VideoBackground from '@/components/VideoBackground';
import logo from '@/image/logo.jpeg';
import { AuthProvider } from '@/contexts/AuthContext';
import FirebaseAnalyticsInit from '@/components/FirebaseAnalyticsInit';

const spaceGrotesk = Space_Grotesk({ 
  subsets: ['latin'], 
  variable: '--font-space-grotesk',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  fallback: ['system-ui', 'sans-serif']
});

const inter = Inter({ 
  subsets: ['latin'], 
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  fallback: ['system-ui', 'sans-serif']
});

export const metadata: Metadata = {
  title: 'StockCSV - AI-Powered Stock Metadata Generator',
  description: 'Generate platform-ready stock metadata from filenames and assets',
  icons: {
    icon: logo.src,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body className="min-h-screen bg-dark-bg font-sans" style={{ fontFamily: 'var(--font-space-grotesk), system-ui, sans-serif' }}>
        <AuthProvider>
          <FirebaseAnalyticsInit />
          <VideoBackground />
          <header className="sticky top-0 z-50 bg-dark-elevated/80 backdrop-blur-md border-b border-green-accent/20 shadow-green-glow">
            <div className="container px-4">
              <Header />
            </div>
          </header>
          <main className="w-full max-w-full lg:w-[90%] lg:max-w-[90%] mx-auto px-4 sm:px-6 py-4 sm:py-6 min-h-screen relative z-10">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}


