// A single-image picker: drag & drop or click, with a preview.
// Shows the already saved image (existingUrl) until a new file is chosen;
// removing the chosen file goes back to the saved one.

"use client";

import { ImageIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useFileUpload } from "@/hooks/use-file-upload";

interface ImageFieldProps {
  label: string;
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
  hint?: string;
  maxSizeMB?: number;
  /** Tailwind height class for the preview box */
  heightClass?: string;
}

export default function ImageField({
  label,
  existingUrl,
  onChange,
  hint,
  maxSizeMB = 5,
  heightClass = "h-44",
}: ImageFieldProps) {
  const [{ files, isDragging, errors }, handlers] = useFileUpload({
    accept: "image/*",
    maxSize: maxSizeMB * 1024 * 1024,
    onFilesChange: (list) => {
      const file = list[0]?.file;
      onChange(file instanceof File ? file : null);
    },
  });

  const preview = files[0]?.preview || existingUrl || null;

  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <div
        onDragEnter={handlers.handleDragEnter}
        onDragLeave={handlers.handleDragLeave}
        onDragOver={handlers.handleDragOver}
        onDrop={handlers.handleDrop}
        className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 transition-colors ${
          isDragging ? "border-primary bg-accent" : "border-border"
        }`}
      >
        <input {...handlers.getInputProps()} className="sr-only" />

        {preview ? (
          <div className={`relative w-full ${heightClass}`}>
            <img
              src={preview}
              alt={label}
              className="h-full w-full rounded-lg object-cover"
            />
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => handlers.removeFile(files[0].id)}
                aria-label="Remove selected image"
                className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="absolute bottom-2 left-2"
              onClick={handlers.openFileDialog}
            >
              <UploadIcon className="mr-2 h-3 w-3" /> Replace
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 text-center">
            <ImageIcon className="mb-2 h-6 w-6 opacity-60" />
            <p className="text-sm text-muted-foreground">Drop or click to upload</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handlers.openFileDialog}
            >
              <UploadIcon className="mr-2 h-3 w-3" /> Select Image
            </Button>
          </div>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {errors[0] && <p className="mt-1 text-xs text-red-500">{errors[0]}</p>}
    </div>
  );
}
