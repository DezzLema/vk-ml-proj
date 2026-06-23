import heic2any from 'heic2any';

export async function convertHeicToJpeg(file: File): Promise<File> {
  console.log('🔄 Конвертация HEIC в основном потоке...');
  
  try {
    const resultBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92
    });
    
    const jpegBlob = Array.isArray(resultBlob) ? resultBlob[0] : resultBlob;
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const jpegFile = new File([jpegBlob], newFileName, { type: 'image/jpeg' });
    
    console.log('✅ HEIC конвертирован в JPEG');
    return jpegFile;
    
  } catch (error) {
    console.error('❌ Ошибка конвертации HEIC:', error);
    throw new Error(`Не удалось конвертировать HEIC: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}