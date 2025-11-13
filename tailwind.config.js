/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // Dark background colors
        'dark-bg': '#0a0a0a',
        'dark-surface': '#0f0f0f',
        'dark-elevated': '#1a1a1a',
        // Green/Teal accent colors
        'green-accent': '#10b981',
        'green-bright': '#22c55e',
        'green-glow': '#34d399',
        'teal-accent': '#14b8a6',
        'teal-bright': '#2dd4bf',
        'teal-glow': '#5eead4',
        // Legacy violet colors (kept for backward compatibility, will be replaced)
        'violet-deep': '#0a0a0a',
        'violet-surface': '#1a1a1a',
        'violet-light': '#2a2a2a',
        'violet-accent': '#10b981',
        'violet-bright': '#2dd4bf',
        'purple-accent': '#14b8a6',
        // Text colors
        'text-primary': '#f3f4f6',
        'text-secondary': '#e5e7eb',
        'text-tertiary': '#9ca3af',
        // Status colors
        'success': '#10b981',
        'warning': '#f59e0b',
        'error': '#ef4444',
        'info': '#3b82f6',
        // Legacy aliases
        deep: '#1a1a1a',
        bg: '#0a0a0a',
        warm: '#10b981',
        ink: '#f3f4f6',
        paper: '#1a1a1a'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      container: {
        center: true
      },
      boxShadow: {
        'green-glow': '0 0 10px rgba(16, 185, 129, 0.3)',
        'green-glow-lg': '0 0 15px rgba(16, 185, 129, 0.4)',
        'teal-glow': '0 0 10px rgba(20, 184, 166, 0.3)',
        'teal-glow-lg': '0 0 15px rgba(20, 184, 166, 0.4)',
        'dark': '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
        // Legacy
        'violet-glow': '0 0 10px rgba(16, 185, 129, 0.3)',
        'violet-glow-lg': '0 0 15px rgba(16, 185, 129, 0.4)'
      },
      backgroundImage: {
        'green-gradient': 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
        'green-gradient-hover': 'linear-gradient(135deg, #22c55e 0%, #2dd4bf 100%)',
        'teal-gradient': 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 100%)',
        'grid-pattern': 'linear-gradient(rgba(16, 185, 129, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.05) 1px, transparent 1px)',
        // Legacy
        'violet-gradient': 'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
        'violet-gradient-hover': 'linear-gradient(135deg, #22c55e 0%, #2dd4bf 100%)'
      },
      backgroundSize: {
        'grid': '50px 50px'
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'particle-float': 'particle-float 8s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out'
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' }
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 10px rgba(16, 185, 129, 0.3)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 15px rgba(16, 185, 129, 0.5)' }
        },
        'particle-float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.3' },
          '25%': { transform: 'translate(20px, -20px) scale(1.1)', opacity: '0.5' },
          '50%': { transform: 'translate(-10px, -40px) scale(0.9)', opacity: '0.4' },
          '75%': { transform: 'translate(-20px, -20px) scale(1.05)', opacity: '0.5' }
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
};

