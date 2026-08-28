/**
 * Compresses an image file (File object) to a base64 JPEG string.
 * Resizes the image to fit within maximum dimensions while maintaining aspect ratio,
 * and applies compression quality.
 */
export async function compressImage(
  file: File,
  maxWidth = 500,
  maxHeight = 667,
  quality = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("File is not an image"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Scale calculations
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          // Fallback to original read if canvas context fails
          resolve(event.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        
        // Output as lightweight compressed JPEG representation
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      
      img.onerror = () => {
        reject(new Error("Failed to load image in Image object"));
      };

      img.src = event.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file with FileReader"));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Handles image file uploads, attempting compression and falling back to original base64 on error.
 */
export async function uploadAndCompressImage(file: File): Promise<string> {
  try {
    return await compressImage(file);
  } catch (err) {
    console.error("Failed to compress uploaded image, falling back to original:", err);
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("FileReader did not return a string"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}

/**
 * Compresses an image and uploads it to the server, which stores it on disk
 * in the project's data/posters directory. Returns the served poster URL.
 */
export async function uploadPoster(file: File): Promise<string> {
  const dataUrl = await uploadAndCompressImage(file);
  const res = await fetch("/api/upload-poster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  if (!res.ok) {
    let message = "Failed to upload poster";
    try {
      const err = await res.json();
      if (err?.error) message = err.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }
  const data = await res.json();
  return data.url as string;
}
