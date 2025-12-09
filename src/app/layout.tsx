import type { Metadata } from 'next';
import { Space_Grotesk, Inter } from 'next/font/google';
import './globals.css';
import Header from '@/components/Header';
import VideoBackground from '@/components/VideoBackground';
import logo from '@/image/logo.jpeg';
import { AuthProvider } from '@/contexts/AuthContext';

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
          <VideoBackground />
          <header className="sticky top-0 z-50 bg-dark-elevated/80 backdrop-blur-md border-b border-green-accent/20 shadow-green-glow">
            {/* Top announcement ticker */}
            <div className="border-b border-green-accent/30 bg-gradient-to-r from-emerald-500/80 via-teal-400/80 to-emerald-500/80 text-emerald-50">
              <div className="container px-4 py-2 text-sm sm:text-base md:text-lg font-semibold ticker-container">
                <div className="ticker-track">
                  <span className="mr-8">
                    Big news: Groq is now live as a Gemini alternative. Connect your own API keys and process unlimited files.
                  </span>
                  <span className="mr-8" aria-hidden="true">
                    Big news: Groq is now live as a Gemini alternative. Connect your own API keys and process unlimited files.
                  </span>
                </div>
              </div>
            </div>
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


