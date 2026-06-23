/// <reference lib="webworker" />

const ctx: Worker = self as any;
let isCancelled = false;

interface CorrectionParams {
  brightness: number;
  contrast: number;
  saturation: number;
}

ctx.addEventListener('message', async (event) => {
  const { taskId, file, modelUrl } = event.data;

  try {
    isCancelled = false;

    sendProgress(taskId, 'loading_tfjs', 5);
    const tf = await import('@tensorflow/tfjs');

    sendProgress(taskId, 'decoding', 10);
    const imageData = await decodeImage(file);
    if (isCancelled) return;

    sendProgress(taskId, 'loading_model', 20);
    const model = await tf.loadLayersModel(modelUrl);
    if (isCancelled) return;

    sendProgress(taskId, 'preprocessing', 35);
    const inputTensor = preprocessImage(imageData, tf);
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
    console.error('Worker error:', error);
    ctx.postMessage({
      type: 'error',
      taskId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

ctx.addEventListener('message', (event) => {
  if (event.data.type === 'cancel' && event.data.taskId) {
    isCancelled = true;
  }
});

function sendProgress(taskId: string, status: string, progress: number) {
  ctx.postMessage({
    type: 'progress',
    taskId,
    status,
    progress
  });
}

async function decodeImage(file: File): Promise<ImageData> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const imageBitmap = await createImageBitmap(new Blob([arrayBuffer]));
    
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      throw new Error('Не удалось получить контекст canvas');
    }
    
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);
    
    imageBitmap.close();
    return imageData;
    
  } catch (error) {
    console.error('Decode error:', error);
    throw new Error(`Ошибка декодирования изображения: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function preprocessImage(imageData: ImageData, tf: any): any {
  const canvas = new OffscreenCanvas(224, 224);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Не удалось получить контекст canvas');
  
  const tempCanvas = new OffscreenCanvas(imageData.width, imageData.height);
  const tempCtx = tempCanvas.getContext('2d');
  
  if (!tempCtx) throw new Error('Не удалось получить контекст canvas');
  
  tempCtx.putImageData(imageData, 0, 0);
  ctx.drawImage(tempCanvas, 0, 0, 224, 224);
  
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

async function predict(model: any, input: any): Promise<CorrectionParams> {
  const output = model.predict(input) as any;
  const values = await output.data();
  
  const valuesArray = Array.from(values);
  
  if (valuesArray.length < 3) {
    throw new Error(`Ожидалось 3 значения, получено ${valuesArray.length}`);
  }
  
  const brightnessLog = Number(valuesArray[0]);
  const contrastLog = Number(valuesArray[1]);
  const saturationLog = Number(valuesArray[2]);
  
  if (isNaN(brightnessLog) || isNaN(contrastLog) || isNaN(saturationLog)) {
    throw new Error('Модель вернула нечисловые значения');
  }
  
  console.log('Raw values:', valuesArray);
  console.log('Log params:', brightnessLog, contrastLog, saturationLog);
  
  // Рассчитываем коэффициенты с ограничением
  let brightness = Math.exp(brightnessLog);
  let contrast = Math.exp(contrastLog);
  let saturation = Math.exp(saturationLog);
  
  // Ограничиваем значения для предотвращения пересвета
  brightness = Math.max(0.5, Math.min(1, brightness));
  contrast = Math.max(0.5, Math.min(1.2, contrast));
  saturation = Math.max(0.5, Math.min(1.2, saturation));
  
  const params: CorrectionParams = {
    brightness,
    contrast,
    saturation
  };
  
  console.log('Final params (limited):', params);
  
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

    // Яркость с S-образной защитой светов
    r = applyBrightnessSmooth(r, brightness);
    g = applyBrightnessSmooth(g, brightness);
    b = applyBrightnessSmooth(b, brightness);

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

// Плавная яркость: тени поднимаются, света почти не меняются
function applyBrightnessSmooth(value: number, brightness: number): number {
  const v = value / 255;
  // S-образная кривая: чем ближе к 1, тем меньше изменение
  const protection = v * v * v * 0.8; // 0→0, 0.5→0.1, 1→0.8
  const effectiveBrightness = 1.0 + (brightness - 1.0) * (1.0 - protection);
  const result = v * effectiveBrightness;
  return Math.max(0, Math.min(1, result)) * 255;
}

async function encodeImage(imageData: ImageData): Promise<string> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) throw new Error('Не удалось получить контекст canvas');
  
  ctx.putImageData(imageData, 0, 0);
  
  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: 0.92
  });
  
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Ошибка кодирования'));
    reader.readAsDataURL(blob);
  });
}

export default ctx;