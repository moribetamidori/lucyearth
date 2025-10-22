/**
 * Generates a thumbnail image from a video file by extracting the first frame
 * @param videoFile The video file to generate a thumbnail from
 * @returns A Promise that resolves to a Blob containing the thumbnail image
 */
export async function generateVideoThumbnail(videoFile: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      reject(new Error('Could not get canvas context'));
      return;
    }

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      // Seek to 0.1 seconds to avoid potential black frames at the start
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to create thumbnail blob'));
          }

          // Clean up
          URL.revokeObjectURL(video.src);
        },
        'image/jpeg',
        0.8
      );
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
      URL.revokeObjectURL(video.src);
    };

    // Load the video file
    video.src = URL.createObjectURL(videoFile);
  });
}
