"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { uploadCatPicture, fetchCatPictures, deleteCatPicture } from "@/lib/imageUpload";
import type { CatPicture } from "@/lib/supabase";

type CatProfileProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode?: boolean;
};

type Tab = "cara" | "tangerine" | "pictures" | "backpack";

const PICTURES_PER_PAGE = 9;

export default function CatProfile({
  isOpen,
  onClose,
  anonId,
  isEditMode,
}: CatProfileProps) {
  const [activeTab, setActiveTab] = useState<Tab>("cara");
  const [catPictures, setCatPictures] = useState<CatPicture[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(-1);
  const [showControls, setShowControls] = useState(true);
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasShownSwipeHint = useRef(false);
  const [totalPictures, setTotalPictures] = useState(0);
  const [isLoadingPictures, setIsLoadingPictures] = useState(false);

  const loadCatPictures = useCallback(
    async (page: number, options: { reset?: boolean } = {}) => {
      const { reset = false } = options;
      const safePage = Math.max(1, page);
      setIsLoadingPictures(true);
      try {
        const { pictures, total } = await fetchCatPictures(safePage, PICTURES_PER_PAGE);
        setTotalPictures(total);
        setCatPictures((prev) => {
          if (reset || safePage === 1) {
            return pictures;
          }
          return [...prev, ...pictures];
        });
        return pictures;
      } catch (error) {
        console.error("Failed to load cat pictures:", error);
        return [];
      } finally {
        setIsLoadingPictures(false);
      }
    },
    []
  );

  // Fetch cat pictures when component mounts or tab changes to pictures
  useEffect(() => {
    if (isOpen && activeTab === "pictures") {
      setCurrentPage(1);
      loadCatPictures(1, { reset: true });
    }
  }, [isOpen, activeTab, loadCatPictures]);

  // Reset lightbox selection when changing pages
  useEffect(() => {
    setSelectedImage(null);
    setSelectedImageIndex(-1);
  }, [currentPage]);

  const handlePageChange = (page: number) => {
    const maxPage = Math.max(1, Math.ceil(totalPictures / PICTURES_PER_PAGE));
    const safePage = Math.min(Math.max(1, page), maxPage);
    const loadedPages = Math.ceil(catPictures.length / PICTURES_PER_PAGE) || 0;
    if (safePage > loadedPages && catPictures.length < totalPictures) {
      void loadCatPictures(safePage);
    }
    setCurrentPage(safePage);
  };

  const goToNextPicture = useCallback(async () => {
    if (selectedImageIndex < 0) return;

    if (selectedImageIndex < catPictures.length - 1) {
      const newIndex = selectedImageIndex + 1;
      setSelectedImageIndex(newIndex);
      setSelectedImage(catPictures[newIndex].image_url);
      return;
    }

    const loadedPages = Math.ceil(catPictures.length / PICTURES_PER_PAGE);
    const totalPages = Math.ceil(totalPictures / PICTURES_PER_PAGE);
    if (
      catPictures.length >= totalPictures ||
      loadedPages >= totalPages ||
      isLoadingPictures
    ) {
      return;
    }

    const newPage = loadedPages + 1;
    const previousLength = catPictures.length;
    const newPictures = await loadCatPictures(newPage);
    if (newPictures.length > 0) {
      const newIndex = previousLength;
      setSelectedImageIndex(newIndex);
      setSelectedImage(newPictures[0].image_url);
    }
  }, [
    catPictures,
    isLoadingPictures,
    loadCatPictures,
    selectedImageIndex,
    totalPictures,
  ]);

  const goToPreviousPicture = useCallback(() => {
    if (selectedImageIndex > 0) {
      const newIndex = selectedImageIndex - 1;
      setSelectedImageIndex(newIndex);
      setSelectedImage(catPictures[newIndex].image_url);
    }
  }, [catPictures, selectedImageIndex]);

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
    if (selectedImage) {
      resetHideControlsTimer();
      // Show swipe hint on mobile only once per session when first opening an image
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
  }, [selectedImage]);

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

    if (isLeftSwipe) {
      void goToNextPicture();
    }
    if (isRightSwipe) {
      goToPreviousPicture();
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Convert FileList to array for easier processing
    const fileArray = Array.from(files);

    // Validate all files
    for (const file of fileArray) {
      // Validate file type (accept images and videos)
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        alert(`"${file.name}" is not an image or video file. Please select only image or video files.`);
        return;
      }

      // Validate file size (max 50MB for videos, 10MB for images)
      const maxSize = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
      if (file.size > maxSize) {
        const maxSizeMB = file.type.startsWith("video/") ? "50MB" : "10MB";
        alert(`"${file.name}" is larger than ${maxSizeMB}. Please select a smaller file.`);
        return;
      }
    }

    setIsUploading(true);
    try {
      // Upload all files sequentially
      for (const file of fileArray) {
        await uploadCatPicture(file, anonId);
      }
      setCurrentPage(1);
      await loadCatPictures(1, { reset: true });
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload one or more files. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePicture = async (pic: CatPicture) => {
    if (!confirm("Delete this picture?")) return;

    try {
      await deleteCatPicture(pic.id, pic.image_url);
      setCurrentPage(1);
      setSelectedImage(null);
      setSelectedImageIndex(-1);
      await loadCatPictures(1, { reset: true });
    } catch (error) {
      console.error("Failed to delete picture:", error);
      alert("Failed to delete picture. Please try again.");
    }
  };

  if (!isOpen) return null;

  // Calculate age from birthdate
  const calculateAge = () => {
    const birthdate = new Date("2025-03-26");
    const today = new Date();

    let years = today.getFullYear() - birthdate.getFullYear();
    let months = today.getMonth() - birthdate.getMonth();

    // Adjust for negative months
    if (months < 0) {
      years--;
      months += 12;
    }

    // Adjust if the current day is before the birth day in the month
    if (today.getDate() < birthdate.getDate()) {
      months--;
      if (months < 0) {
        years--;
        months += 12;
      }
    }

    if (years === 0) {
      return `${months} month${months !== 1 ? "s" : ""}`;
    } else if (months === 0) {
      return `${years} year${years !== 1 ? "s" : ""}`;
    } else {
      return `${years} year${years !== 1 ? "s" : ""}, ${months} month${months !== 1 ? "s" : ""
        }`;
    }
  };

  const age = calculateAge();

  // Cat data
  const catData = {
    cara: {
      name: "Cara",
      age: age,
      birthday: "March 26, 2025",
      gender: "♀",
      personality: "Curious & Playful",
      favoriteFood: "VE Freeze Dried Chicken Entree",
      mood: "Happy 😸",
      energy: "85%",
      hunger: "30%",
      affection: "95%",
    },
    tangerine: {
      name: "Tangerine",
      age: age,
      birthday: "March 26, 2025",
      gender: "♂",
      personality: "Sleepy & Sweet",
      favoriteFood: "Churu Cat Treats",
      mood: "Sleepy 😴",
      energy: "45%",
      hunger: "60%",
      affection: "100%",
    },
  };

  // Backpack items - placeholder for cat cans and accessories
  const backpackItems = [
    {
      id: 1,
      name: "Fancy Feast Cat Food 24 Packs",
      image: "/images/cats/backpacks/cans.webp",
      price: 20.99,
    },
    {
      id: 2,
      name: "Tidy Cat Litter 38lb",
      image: "/images/cats/backpacks/litter.webp",
      price: 25.99,
    },
    {
      id: 3,
      name: "Vital Essentials Chicken Entree",
      image: "/images/cats/backpacks/ve.webp",
      price: 39.99,
    },
    { id: 4, name: "Churu Cat Treats", image: "/images/cats/backpacks/churu.webp", price: 44.99 },
    { id: 5, name: "Nuvuo 3 Pack Cat Collar ", image: "/images/cats/backpacks/collar.webp", price: 27.99 },
    { id: 6, name: "Litter Robot 4", image: "/images/cats/backpacks/litterrobot.webp", price: 799.99 },
  ];

  const renderCatStats = (cat: "cara" | "tangerine") => {
    const data = catData[cat];
    const imagePath =
      cat === "cara" ? "/images/cats/cara.png" : "/images/cats/tan.png";

    return (
      <div className="space-y-6">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img
              src={imagePath}
              alt={data.name}
              className="w-48 h-48 object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          </div>
          <h2 className="text-4xl mb-2">{data.name}</h2>
          <div className="text-sm text-gray-400">{data.personality}</div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="border-2 border-gray-900 p-4">
            <div className="text-xs text-gray-400 mb-1">AGE {data.gender}</div>
            <div className="text-lg">{data.age}</div>
          </div>
          <div className="border-2 border-gray-900 p-4">
            <div className="text-xs text-gray-400 mb-1">BIRTHDAY</div>
            <div className="text-sm">{data.birthday} ♈</div>
          </div>
          <div className="border-2 border-gray-900 p-4">
            <div className="text-xs text-gray-400 mb-1">MOOD</div>
            <div className="text-lg">{data.mood}</div>
          </div>
          <div className="border-2 border-gray-900 p-4">
            <div className="text-xs text-gray-400 mb-1">FAVORITE FOOD</div>
            <div className="text-lg">{data.favoriteFood}</div>
          </div>
        </div>

        <div className="space-y-3 mt-6">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">HUNGER</span>
              <span>{data.hunger}</span>
            </div>
            <div className="h-2 bg-gray-200 border border-gray-900">
              <div
                className="h-full bg-orange-400"
                style={{ width: data.hunger }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-gray-400">AFFECTION</span>
              <span>{data.affection}</span>
            </div>
            <div className="h-2 bg-gray-200 border border-gray-900">
              <div
                className="h-full bg-pink-400"
                style={{ width: data.affection }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPictures = () => {
    const totalPages = Math.max(1, Math.ceil(totalPictures / PICTURES_PER_PAGE));
    const startIndex = (currentPage - 1) * PICTURES_PER_PAGE;
    const endIndex = startIndex + PICTURES_PER_PAGE;
    const currentPictures = catPictures.slice(startIndex, endIndex);

    return (
      <div className="space-y-4">
        {/* Upload button - Only show in edit mode */}
        {isEditMode && (
          <div className="flex justify-end">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif,video/*"
              onChange={handleFileSelect}
              className="hidden"
              multiple
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-2 border-2 border-gray-900 hover:bg-orange-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isUploading ? "UPLOADING..." : "+ UPLOAD MEDIA"}
            </button>
          </div>
        )}

        {isLoadingPictures && !selectedImage && (
          <div className="text-center text-xs text-gray-500">Loading pictures...</div>
        )}

        {/* Pictures grid */}
        <div className="grid grid-cols-3 gap-4">
          {currentPictures.map((pic, idx) => {
            const isVideo = pic.media_type === 'video';
            const globalIndex = startIndex + idx;
            return (
              <div
                key={pic.id}
                className="relative aspect-square border-2 border-gray-900 overflow-hidden bg-gray-100 hover:border-orange-400 transition-colors cursor-pointer group"
              >
                {isVideo ? (
                  <video
                    src={pic.image_url}
                    poster={pic.thumbnail_url || undefined}
                    className="w-full h-full object-cover"
                    onClick={() => {
                      setSelectedImage(pic.image_url);
                      setSelectedImageIndex(globalIndex);
                    }}
                    muted
                    playsInline
                  />
                ) : (
                  <img
                    src={pic.image_url}
                    alt="Cat picture"
                    className="w-full h-full object-cover"
                    style={{ imageRendering: "pixelated" }}
                    onClick={() => {
                      setSelectedImage(pic.image_url);
                      setSelectedImageIndex(globalIndex);
                    }}
                  />
                )}
                {/* Video indicator badge */}
                {isVideo && (
                  <div className="absolute top-2 left-2 bg-gray-900 text-white px-2 py-1 text-xs">
                    ▶ VIDEO
                  </div>
                )}
                {isEditMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePicture(pic);
                    }}
                    className="absolute top-2 right-2 bg-red-500 text-white px-2 py-1 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}

          {currentPictures.length === 0 && !isUploading && !isLoadingPictures && totalPictures === 0 && (
            <div className="col-span-3 text-center py-12 text-gray-400 border-2 border-dashed border-gray-300">
              No media yet. Upload your first cat picture or video!
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPictures > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 border-2 border-gray-900 hover:bg-orange-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              {"<"}
            </button>
            <div className="text-sm px-4">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 border-2 border-gray-900 hover:bg-orange-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              {">"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderBackpack = () => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {backpackItems.map((item) => (
          <div
            key={item.id}
            className="border-2 border-gray-900 overflow-hidden bg-white hover:border-orange-400 transition-colors cursor-pointer"
          >
            <div className="aspect-square overflow-hidden relative bg-white">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover"
                style={{ imageRendering: "pixelated" }}
              />
              <div className="absolute top-2 left-2 bg-orange-500 text-white px-2 py-1 text-xs font-bold border-2 border-gray-900">
                ${item.price.toFixed(2)}
              </div>
            </div>
            <div className="p-2 border-t-2 border-gray-900 bg-white">
              <div className="text-xs text-center">{item.name}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border-4 border-gray-900 max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b-2 border-gray-900 flex justify-between items-center">
          <h1 className="text-2xl">🐱 CAT PROFILES</h1>
          <button
            onClick={onClose}
            className="w-8 h-8 border-2 border-gray-900 hover:bg-red-500 hover:text-white transition-colors text-xl flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b-2 border-gray-900">
          <button
            onClick={() => setActiveTab("cara")}
            className={`flex-1 px-4 py-3 border-r-2 border-gray-900 transition-colors text-sm ${activeTab === "cara"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
              }`}
          >
            CARA
          </button>
          <button
            onClick={() => setActiveTab("tangerine")}
            className={`flex-1 px-4 py-3 border-r-2 border-gray-900 transition-colors text-sm ${activeTab === "tangerine"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
              }`}
          >
            TANGERINE
          </button>
          <button
            onClick={() => setActiveTab("backpack")}
            className={`flex-1 px-4 py-3 border-r-2 border-gray-900 transition-colors text-sm ${activeTab === "backpack"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
              }`}
          >
            BACKPACK
          </button>
          <button
            onClick={() => setActiveTab("pictures")}
            className={`flex-1 px-4 py-3 transition-colors text-sm ${activeTab === "pictures"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
              }`}
          >
            PICTURES
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "cara" && renderCatStats("cara")}
          {activeTab === "tangerine" && renderCatStats("tangerine")}
          {activeTab === "backpack" && renderBackpack()}
          {activeTab === "pictures" && renderPictures()}
        </div>
      </div>

      {/* Image Lightbox - Within modal */}
      {selectedImage && selectedImageIndex >= 0 && catPictures.length > 0 && (
        <div
          className="absolute inset-0 backdrop-blur-md bg-white/80 flex items-center justify-between z-10 p-4"
          onMouseMove={resetHideControlsTimer}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedImage(null);
              setSelectedImageIndex(-1);
            } else {
              resetHideControlsTimer();
            }
          }}
        >
          {/* Close button - Fixed top right */}
          <button
            onClick={() => {
              setSelectedImage(null);
              setSelectedImageIndex(-1);
            }}
            className={`fixed top-4 right-4 text-gray-900 text-4xl hover:text-orange-400 transition-all duration-300 z-50 bg-white/80 w-12 h-12 flex items-center justify-center border-2 border-gray-900 ${showControls ? 'opacity-100' : 'opacity-0'
              }`}
          >
            ×
          </button>

          {/* Image counter - Fixed bottom center */}
          <div
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 text-sm border-2 border-gray-900 transition-all duration-300 z-50 ${showControls ? 'opacity-100' : 'opacity-0'
              }`}
          >
            {selectedImageIndex + 1} / {Math.max(totalPictures, catPictures.length)}
          </div>
          {/* Previous button - Desktop only */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              goToPreviousPicture();
            }}
            disabled={selectedImageIndex === 0}
            className={`hidden md:flex bg-gray-900 text-white px-3 py-2 text-2xl hover:bg-orange-400 transition-all duration-300 border-2 border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed self-center ${showControls ? 'opacity-100' : 'opacity-0'
              }`}
          >
            ←
          </button>

          {/* Image container with swipe support */}
          <div
            className="relative flex flex-col items-center gap-4 flex-1 mx-2 md:mx-4"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Swipe hint animation - Mobile only */}
            {showSwipeHint && (
              <div className="md:hidden absolute inset-0 flex items-center justify-center pointer-events-none z-30">
                <div className="flex gap-4 items-center animate-pulse">
                  <div className="text-4xl text-gray-900/50 animate-[wiggle_1s_ease-in-out_infinite]">←</div>
                  <div className="text-sm text-gray-900/70 bg-white/90 px-3 py-2 rounded border-2 border-gray-900">
                    Swipe to navigate
                  </div>
                  <div className="text-4xl text-gray-900/50 animate-[wiggle_1s_ease-in-out_infinite]">→</div>
                </div>
              </div>
            )}

            {/* Image or Video */}
            {catPictures[selectedImageIndex]?.media_type === 'video' ? (
              <video
                src={selectedImage}
                poster={catPictures[selectedImageIndex]?.thumbnail_url || undefined}
                className="max-w-full max-h-[calc(90vh-12rem)] object-contain border-4 border-gray-900"
                onClick={(e) => e.stopPropagation()}
                controls
                autoPlay
                loop
                playsInline
              />
            ) : (
              <img
                src={selectedImage}
                alt="Enlarged cat picture"
                className="max-w-full max-h-[calc(90vh-12rem)] object-contain border-4 border-gray-900"
                style={{ imageRendering: 'pixelated' }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>

          {/* Next button - Desktop only */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void goToNextPicture();
            }}
            disabled={
              selectedImageIndex === catPictures.length - 1 &&
              catPictures.length >= totalPictures
            }
            className={`hidden md:flex bg-gray-900 text-white px-3 py-2 text-2xl hover:bg-orange-400 transition-all duration-300 border-2 border-gray-900 disabled:opacity-30 disabled:cursor-not-allowed self-center ${showControls ? 'opacity-100' : 'opacity-0'
              }`}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
