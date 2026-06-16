/// <reference lib="webworker" />

import * as tf from '@tensorflow/tfjs';
import { CorrectionParams } from '../types/index';
// Заменяем heic-to на heic2any
import heic2any from 'heic2any';

const ctx: Worker = self as any;
let isCancelled = false;

ctx.addEventListener('message', async (event) => {
  const { taskId, file, modelUrl } = event.data;
  
  try {
    isCancelled = false;
    

    sendProgress(taskId, 'decoding', 10);
    const imageData = await decodeImage(file);
    if (isCancelled) return;


    sendProgress(taskId, 'loading_model', 20);
    const model = await tf.loadLayersModel(modelUrl);
    if (isCancelled) return;


    sendProgress(taskId, 'preprocessing', 35);
    const inputTensor = preprocessImage(imageData);
    if (isCancelled) return;

  
    sendProgress(taskId, 'inference', 50);
    const params = await predict(model, inputTensor);
    if (isCancelled) return;


    sendProgress(taskId, 'applying_filters', 70);
    const enhancedImageData = applyCorrections(imageData, params);
    if (isCancelled) return;


    sendProgress(taskId, 'encoding', 85);
    const result = await encodeImage(enhancedImageData);
    if (isCancelled) return;


    sendProgress(taskId, 'complete', 100);
    ctx.postMessage({
      type: 'complete',
      taskId,
      result
    });


    inputTensor.dispose();
    model.dispose();

  } catch (error) {
    ctx.postMessage({
      type: 'error',
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Обработка отмены
ctx.addEventListener('message', (event) => {
  if (event.data.type === 'cancel' && event.data.taskId) {
    isCancelled = true;
  }
});

// Вспомогательные функции
function sendProgress(taskId: string, status: string, progress: number) {
  ctx.postMessage({
    type: 'progress',
    taskId,
    status,
    progress
  });
}


async function decodeImage(file: File): Promise<ImageData> {
  // Проверяем, является ли файл HEIC/HEIF
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isHeic = extension === 'heic' || extension === 'heif';
  
  let imageFile = file;

  if (isHeic) {
    try {
      sendProgress('', 'decoding_heic', 5);
      

      const resultBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.92
      });
      

      const jpegBlob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
      
      const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      imageFile = new File([jpegBlob], newFileName, { type: 'image/jpeg' });
    } catch (error) {
      throw new Error(`Ошибка конвертации HEIC: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const img = new Image();
        img.onload = () => {
          let canvas: HTMLCanvasElement | OffscreenCanvas;
          let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
          
          try {
            canvas = new OffscreenCanvas(img.width, img.height);
            ctx = canvas.getContext('2d');
          } catch {
            canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx = canvas.getContext('2d');
          }
          
          if (!ctx) {
            reject(new Error('Не удалось получить контекст canvas'));
            return;
          }
          
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);
          resolve(imageData);
        };
        img.onerror = () => reject(new Error('Ошибка загрузки изображения'));
        img.src = e.target?.result as string;
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(imageFile);
  });
}


function preprocessImage(imageData: ImageData): tf.Tensor {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  
  try {
    canvas = new OffscreenCanvas(224, 224);
    ctx = canvas.getContext('2d');
  } catch {
    canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 224;
    ctx = canvas.getContext('2d');
  }
  
  if (!ctx) throw new Error('Не удалось получить контекст canvas');
  
  let tempCanvas: HTMLCanvasElement | OffscreenCanvas;
  let tempCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  
  try {
    tempCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    tempCtx = tempCanvas.getContext('2d');
  } catch {
    tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    tempCtx = tempCanvas.getContext('2d');
  }
  
  if (!tempCtx) throw new Error('Не удалось получить контекст canvas');
  
  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas as any, 0, 0, 224, 224);
  
  const resizedData = ctx.getImageData(0, 0, 224, 224);
  
  const tensor = tf.tidy(() => {
    const imgTensor = tf.browser.fromPixels(resizedData, 3);
    return imgTensor
      .toFloat()
      .div(255.0)
      .expandDims(0);
  });
  
  return tensor;
}


async function predict(model: tf.LayersModel, input: tf.Tensor): Promise<CorrectionParams> {
  const output = model.predict(input) as tf.Tensor;
  const values = await output.data();
  
  const [brightnessLog, contrastLog, saturationLog] = Array.from(values);
  
  const params: CorrectionParams = {
    brightness: Math.max(0.5, Math.min(2.0, Math.exp(brightnessLog))),
    contrast: Math.max(0.5, Math.min(2.0, Math.exp(contrastLog))),
    saturation: Math.max(0.5, Math.min(2.0, Math.exp(saturationLog)))
  };
  
  output.dispose();
  return params;
}


function applyCorrections(imageData: ImageData, params: CorrectionParams): ImageData {
  const { brightness, contrast, saturation } = params;
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    // Контрастность
    r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
    g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
    b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
    
    // Яркость
    r = r * brightness;
    g = g * brightness;
    b = b * brightness;
    
    // Насыщенность
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;
    
    data[i] = Math.max(0, Math.min(255, Math.round(r)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }
  
  return imageData;
}


async function encodeImage(imageData: ImageData): Promise<string> {
  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  
  try {
    canvas = new OffscreenCanvas(imageData.width, imageData.height);
    ctx = canvas.getContext('2d');
  } catch {
    canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    ctx = canvas.getContext('2d');
  }
  
  if (!ctx) throw new Error('Не удалось получить контекст canvas');
  
  ctx.putImageData(imageData, 0, 0);
  
  let blob: Blob;
  try {
    blob = await (canvas as OffscreenCanvas).convertToBlob({ 
      type: 'image/jpeg', 
      quality: 0.92 
    });
  } catch {
    blob = await new Promise((resolve) => {
      (canvas as HTMLCanvasElement).toBlob(
        (b) => resolve(b!), 
        'image/jpeg', 
        0.92
      );
    });
  }
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Ошибка кодирования'));
    reader.readAsDataURL(blob);
  });
}

export default ctx;