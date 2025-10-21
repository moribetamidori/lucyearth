"use client";

import { useState, useEffect, useRef } from "react";
import { uploadCatPicture, fetchCatPictures, deleteCatPicture } from "@/lib/imageUpload";
import type { CatPicture } from "@/lib/supabase";

type CatProfileProps = {
  isOpen: boolean;
  onClose: () => void;
  anonId?: string;
  isEditMode?: boolean;
};

type Tab = "cara" | "tangerine" | "pictures" | "backpack";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const PICTURES_PER_PAGE = 9;

  // Fetch cat pictures when component mounts or tab changes to pictures
  useEffect(() => {
    if (isOpen && activeTab === "pictures") {
      loadCatPictures();
    }
  }, [isOpen, activeTab]);

  const loadCatPictures = async () => {
    const pictures = await fetchCatPictures();
    setCatPictures(pictures);
    setCurrentPage(1); // Reset to first page when pictures reload
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
      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert(`"${file.name}" is not an image file. Please select only image files.`);
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert(`"${file.name}" is larger than 10MB. Please select smaller images.`);
        return;
      }
    }

    setIsUploading(true);
    try {
      // Upload all files sequentially
      for (const file of fileArray) {
        await uploadCatPicture(file, anonId);
      }
      await loadCatPictures();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload one or more images. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeletePicture = async (pic: CatPicture) => {
    if (!confirm("Delete this picture?")) return;

    try {
      await deleteCatPicture(pic.id, pic.image_url);
      await loadCatPictures();
      // Adjust current page if needed
      const totalPages = Math.ceil((catPictures.length - 1) / PICTURES_PER_PAGE);
      if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
      }
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
      return `${years} year${years !== 1 ? "s" : ""}, ${months} month${
        months !== 1 ? "s" : ""
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
    // Calculate pagination
    const totalPages = Math.ceil(catPictures.length / PICTURES_PER_PAGE);
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
              accept="image/*,.heic,.heif"
              onChange={handleFileSelect}
              className="hidden"
              multiple
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-6 py-2 border-2 border-gray-900 hover:bg-orange-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isUploading ? "UPLOADING..." : "+ UPLOAD PICTURE"}
            </button>
          </div>
        )}

        {/* Pictures grid */}
        <div className="grid grid-cols-3 gap-4">
          {currentPictures.map((pic) => (
            <div
              key={pic.id}
              className="relative aspect-square border-2 border-gray-900 overflow-hidden bg-gray-100 hover:border-orange-400 transition-colors cursor-pointer group"
            >
              <img
                src={pic.image_url}
                alt="Cat picture"
                className="w-full h-full object-cover"
                style={{ imageRendering: "pixelated" }}
                onClick={() => setSelectedImage(pic.image_url)}
              />
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
          ))}

          {catPictures.length === 0 && !isUploading && (
            <div className="col-span-3 text-center py-12 text-gray-400 border-2 border-dashed border-gray-300">
              No pictures yet. Upload your first cat picture!
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 border-2 border-gray-900 hover:bg-orange-400 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-sm"
            >
              {"<"}
            </button>
            <div className="text-sm px-4">
              Page {currentPage} of {totalPages}
            </div>
            <button
              onClick={() =>
                setCurrentPage((prev) => Math.min(totalPages, prev + 1))
              }
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
            className={`flex-1 px-4 py-3 border-r-2 border-gray-900 transition-colors text-sm ${
              activeTab === "cara"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
            }`}
          >
            CARA
          </button>
          <button
            onClick={() => setActiveTab("tangerine")}
            className={`flex-1 px-4 py-3 border-r-2 border-gray-900 transition-colors text-sm ${
              activeTab === "tangerine"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
            }`}
          >
            TANGERINE
          </button>
          <button
            onClick={() => setActiveTab("pictures")}
            className={`flex-1 px-4 py-3 border-r-2 border-gray-900 transition-colors text-sm ${
              activeTab === "pictures"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
            }`}
          >
            PICTURES
          </button>
          <button
            onClick={() => setActiveTab("backpack")}
            className={`flex-1 px-4 py-3 transition-colors text-sm ${
              activeTab === "backpack"
                ? "bg-orange-400 text-white"
                : "hover:bg-gray-100"
            }`}
          >
            BACKPACK
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "cara" && renderCatStats("cara")}
          {activeTab === "tangerine" && renderCatStats("tangerine")}
          {activeTab === "pictures" && renderPictures()}
          {activeTab === "backpack" && renderBackpack()}
        </div>
      </div>

      {/* Image Lightbox - Within modal */}
      {selectedImage && (
        <div
          className="absolute inset-0 backdrop-blur-md bg-white/80 flex items-center justify-center z-10 p-8"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-8 right-0 text-gray-900 text-3xl hover:text-orange-400 transition-colors"
            >
              ×
            </button>
            <img
              src={selectedImage}
              alt="Enlarged cat picture"
              className="max-w-full max-h-[calc(90vh-8rem)] object-contain border-4 border-gray-900"
              style={{ imageRendering: 'pixelated' }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
