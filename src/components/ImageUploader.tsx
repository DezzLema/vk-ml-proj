import React, { useState, useRef } from 'react';
import { taskManager } from '../services/taskManager';

interface ImageUploaderProps {
  onTaskCreated: (taskId: string) => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ onTaskCreated }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setIsLoading(true);

    try {
      const img = new Image();
      const url = URL.createObjectURL(file);

      await new Promise((resolve, reject) => {
        img.onload = () => {
          const megapixels = (img.width * img.height) / 1000000;
          if (megapixels > 15) {
            reject(new Error(`Image too large (${megapixels.toFixed(1)} MP). Maximum is 15 MP.`));
          }
          resolve(null);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = url;
      });

      const extension = file.name.split('.').pop()?.toLowerCase();
      const isHeic = extension === 'heic' || extension === 'heif';
      const allowedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/heic', 'image/heif'];

      if (!allowedTypes.includes(file.type) && !isHeic) {
        throw new Error(`Format ${file.type || extension} is not supported`);
      }

      const taskId = taskManager.createTask(file);
      onTaskCreated(taskId);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsLoading(false);
      setIsDragOver(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div
      className={`uploader ${isDragOver ? 'drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept=".jpg,.jpeg,.png,.bmp,.heic,.heif,image/jpeg,image/png,image/bmp,image/heic,image/heif"
        onChange={handleFileUpload}
        disabled={isLoading}
      />
      <div className="uploader-label">
        <div className="uploader-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="uploader-title">
          {isLoading ? 'Processing...' : 'Drop your image here'}
        </div>
        <div className="uploader-subtitle">
          {isLoading ? 'Please wait while your image is processed' : 'or click to browse'}
        </div>
        <div className="uploader-formats">
          <span>JPG</span>
          <span>PNG</span>
          <span>BMP</span>
          <span>HEIC</span>
        </div>
        {error && <div className="uploader-error">{error}</div>}
        {isLoading && <div className="uploader-loading">Uploading...</div>}
      </div>
    </div>
  );
};