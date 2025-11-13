'use client';

import { useEffect, useRef, useState } from 'react';

type VideoBackgroundProps = {
  videoSrc?: string;
  fallback?: boolean;
  className?: string;
};

export default function VideoBackground({ 
  videoSrc, 
  fallback = true,
  className = '' 
}: VideoBackgroundProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useFallback, setUseFallback] = useState(!videoSrc || fallback);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (videoRef.current && videoSrc && !useFallback) {
      const video = videoRef.current;
      
      const handleCanPlay = () => {
        setIsLoaded(true);
        video.play().catch(() => {
          // If autoplay fails, use fallback
          setUseFallback(true);
        });
      };

      const handleError = () => {
        setUseFallback(true);
      };

      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
      };
    } else {
      setUseFallback(true);
    }
  }, [videoSrc, useFallback]);

  // Animated fallback with particles
  if (useFallback) {
    return (
      <div className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`} style={{ zIndex: 0 }}>
        {/* Animated gradient background */}
        <div 
          className="absolute inset-0 opacity-30"
          style={{
            background: `
              radial-gradient(circle at 20% 50%, rgba(16, 185, 129, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 80% 80%, rgba(20, 184, 166, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 40% 20%, rgba(34, 211, 238, 0.12) 0%, transparent 50%),
              radial-gradient(circle at 60% 70%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)
            `,
            animation: 'particle-float 20s ease-in-out infinite'
          }}
        />
        
        {/* Floating particles */}
        {Array.from({ length: 15 }).map((_, i) => {
          const size = Math.random() * 4 + 2;
          const left = Math.random() * 100;
          const top = Math.random() * 100;
          const delay = Math.random() * 8;
          const duration = 8 + Math.random() * 4;
          
          return (
            <div
              key={i}
              className="particle"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                left: `${left}%`,
                top: `${top}%`,
                animationDelay: `${delay}s`,
                animationDuration: `${duration}s`,
                background: `radial-gradient(circle, rgba(16, 185, 129, ${0.4 + Math.random() * 0.3}) 0%, transparent 70%)`,
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 overflow-hidden pointer-events-none ${className}`} style={{ zIndex: 0 }}>
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover opacity-20"
        style={{
          filter: 'brightness(0.3) contrast(1.2)',
        }}
      >
        {videoSrc && <source src={videoSrc} type="video/mp4" />}
      </video>
      
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-dark-bg/40" />
      
      {/* Grid overlay */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}
      />
    </div>
  );
}

