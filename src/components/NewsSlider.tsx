'use client';

import { useState } from 'react';

export default function NewsSlider() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  const newsItems = [
    '🎨 Image to Prompt is now available! Generate detailed prompts from your images.',
    '✨ New feature: Transform your images into AI-ready prompts with precision.',
    '🚀 Try the Image to Prompt mode in the Advanced Metadata Controls tab.'
  ];

  return (
    <div className="bg-gradient-to-r from-green-accent/20 via-teal-accent/20 to-green-accent/20 border-b border-green-accent/30 py-2 relative overflow-hidden">
      <div className="ticker-container">
        <div className="ticker-track">
          {/* Duplicate items for seamless loop */}
          {[...newsItems, ...newsItems].map((item, idx) => (
            <span
              key={idx}
              className="inline-block px-8 text-sm font-medium text-green-bright whitespace-nowrap"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
      {/* Close button */}
      <button
        onClick={() => setIsVisible(false)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-green-bright transition-colors z-10"
        aria-label="Close announcement"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
