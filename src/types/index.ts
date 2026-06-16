export interface Task {
  id: string;
  status: 'pending' | 'decoding' | 'loading_model' | 'preprocessing' | 'inference' | 'applying_filters' | 'encoding' | 'complete' | 'error' | 'cancelled';
  progress: number;
  fileName: string;
  fileSize: number;
  originalImage?: string;
  enhancedImage?: string;
  error?: string;
  createdAt: Date;
}

export interface WorkerMessage {
  type: 'progress' | 'complete' | 'error' | 'cancel';
  taskId: string;
  progress?: number;
  status?: string;
  result?: string;
  error?: string;
}

export interface WorkerInput {
  taskId: string;
  file: File;
  modelUrl: string;
}

export interface CorrectionParams {
  brightness: number;
  contrast: number;
  saturation: number;
}