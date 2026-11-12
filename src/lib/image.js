function load(file) {
  const url = URL.createObjectURL(file);
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = (e) => { URL.revokeObjectURL(url); rej(e); };
    i.src = url;
  });
}

function draw(img, max) {
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

// Reduz a foto e devolve um data URL (usado na leitura de notinhas)
export async function compress(file, max = 1600, quality = 0.82) {
  return draw(await load(file), max).toDataURL('image/jpeg', quality);
}

// Reduz a foto e devolve um Blob (usado nos envios para o Storage)
export async function compressBlob(file, max = 1200, quality = 0.78) {
  const c = draw(await load(file), max);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Não consegui preparar a foto'))), 'image/jpeg', quality));
}
