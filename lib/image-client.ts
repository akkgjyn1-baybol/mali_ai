const MAX_SIDE = 1280;

function loadImageElement(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть картинку"));
    };
    img.src = url;
  });
}

export async function shrinkImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Это не картинка");
  const img = await loadImageElement(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Не удалось обработать картинку");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.82, 0.7, 0.55]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length < 1_300_000) return dataUrl;
  }
  throw new Error("Картинка слишком большая");
}
