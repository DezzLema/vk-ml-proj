import heic2any from 'heic2any';

export async function convertHeicToJpeg(file: File): Promise<File> {
  console.log('[HEIC Converter] Starting conversion in main thread...');
  
  try {
    const resultBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92
    });
    
    const jpegBlob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const jpegFile = new File([jpegBlob], newFileName, { type: 'image/jpeg' });
    
    console.log('[HEIC Converter] Conversion completed successfully');
    return jpegFile;
    
  } catch (error) {
    console.error('[HEIC Converter] Conversion failed:', error);
    throw new Error(`HEIC conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}