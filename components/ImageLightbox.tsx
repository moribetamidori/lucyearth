'use client';

import { useState, useEffect, useRef } from 'react';

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function ImageLightbox({
  images,
  initialIndex,
  isOpen,
  onClose,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showControls, setShowControls] = useState(true);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownSwipeHint = useRef(false);

  // Auto-hide controls after 2 seconds of inactivity
  const resetHideControlsTimer = () => {
    setShowControls(true);
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current);
    }
    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 2000);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, []);

  // Reset controls when image changes
  useEffect(() => {
    if (isOpen) {
      resetHideControlsTimer();
      // Show swipe hint on mobile only once per session when first opening
      if (!hasShownSwipeHint.current) {
        setShowSwipeHint(true);
        hasShownSwipeHint.current = true;
        const hintTimer = setTimeout(() => {
          setShowSwipeHint(false);
        }, 3000);
        return () => clearTimeout(hintTimer);
      }
    } else {
      // Reset hint flag when closing the lightbox
      hasShownSwipeHint.current = false;
    }
  }, [isOpen, currentIndex]);

  // Update current index when initialIndex changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Swipe detection
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
    setShowSwipeHint(false);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 backdrop-blur-md bg-white/80 z-[100] flex items-center justify-between p-8"
      onMouseMove={resetHideControlsTimer}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        } else {
          resetHideControlsTimer();
        }
      }}
    >
      {/* Close button - Fixed top right */}
      <button
        onClick={onClose}
        className={`fixed top-4 right-4 text-gray-900 text-4xl hover:text-blue-500 transition-all duration-300 z-[110] bg-white/80 w-12 h-12 flex items-center justify-center border-2 border-black ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        ×
      </button>

      {/* Image counter - Fixed bottom center */}
      {images.length > 1 && (
        <div
          className={`fixed bottom-4 left-1/2 -translate-x-1/2 bg-black text-white px-4 py-2 text-sm border-2 border-black transition-all duration-300 z-[110] ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Previous button - Desktop only */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePrevious();
          }}
          disabled={currentIndex === 0}
          className={`hidden md:flex bg-black text-white px-3 py-2 text-2xl hover:bg-blue-500 transition-all duration-300 border-2 border-black disabled:opacity-30 disabled:cursor-not-allowed self-center ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          ←
        </button>
      )}

      {/* Image container with swipe support */}
      <div
        className="relative flex flex-col items-center gap-4 flex-1 mx-2 md:mx-4"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Swipe hint animation - Mobile only */}
        {showSwipeHint && images.length > 1 && (
          <div className="md:hidden absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="flex gap-4 items-center animate-pulse">
              <div className="text-4xl text-gray-900/50 animate-[wiggle_1s_ease-in-out_infinite]">←</div>
              <div className="text-sm text-gray-900/70 bg-white/90 px-3 py-2 rounded border-2 border-black">
                Swipe to navigate
              </div>
              <div className="text-4xl text-gray-900/50 animate-[wiggle_1s_ease-in-out_infinite]">→</div>
            </div>
          </div>
        )}

        {/* Image */}
        <img
          src={images[currentIndex]}
          alt={`Image ${currentIndex + 1}`}
          className="max-w-full max-h-[calc(90vh-12rem)] object-contain border-4 border-black"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Next button - Desktop only */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleNext();
          }}
          disabled={currentIndex === images.length - 1}
          className={`hidden md:flex bg-black text-white px-3 py-2 text-2xl hover:bg-blue-500 transition-all duration-300 border-2 border-black disabled:opacity-30 disabled:cursor-not-allowed self-center ${
            showControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          →
        </button>
      )}
    </div>
  );
}
