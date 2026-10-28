/* pharmarom tesoro — 사진 캡처·축소·회전·로컬 blob 저장 */
window.Photo = (function () {
  'use strict';
  var MAX = 1600; // OCR 품질 유지하며 용량·속도 절충

  // File → {blob, dataUrl} 축소 (회전값 반영)
  function processFile(file, rotateDeg) {
    rotateDeg = rotateDeg || 0;
    return fileToImage(file).then(function (img) {
      return drawToBlob(img, rotateDeg, null);
    });
  }

  function fileToImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function (e) { URL.revokeObjectURL(url); rej(e); };
      img.src = url;
    });
  }
  function blobToImage(blob) { return fileToImage(blob); }

  // crop: {x,y,w,h} (원본 비율 0~1) 또는 null
  function drawToBlob(img, rotateDeg, crop) {
    var sw = img.naturalWidth, sh = img.naturalHeight;
    var sx = 0, sy = 0;
    if (crop) { sx = crop.x * sw; sy = crop.y * sh; sw = crop.w * sw; sh = crop.h * sh; }
    var canvas = document.createElement('canvas');
    var rot = ((rotateDeg % 360) + 360) % 360;
    var dw = sw, dh = sh;
    // 축소 비율
    var scale = Math.min(1, MAX / Math.max(dw, dh));
    var cw = Math.round(dw * scale), ch = Math.round(dh * scale);
    if (rot === 90 || rot === 270) { canvas.width = ch; canvas.height = cw; }
    else { canvas.width = cw; canvas.height = ch; }
    var ctx = canvas.getContext('2d');
    ctx.save();
    if (rot === 90) { ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); }
    else if (rot === 180) { ctx.translate(canvas.width, canvas.height); ctx.rotate(Math.PI); }
    else if (rot === 270) { ctx.translate(0, canvas.height); ctx.rotate(3 * Math.PI / 2); }
    ctx.drawImage(img, sx, sy, sw * (crop ? 1 : 1), sh * (crop ? 1 : 1), 0, 0, cw, ch);
    ctx.restore();
    return new Promise(function (res) {
      canvas.toBlob(function (blob) {
        res({ blob: blob, dataUrl: canvas.toDataURL('image/jpeg', 0.85), w: canvas.width, h: canvas.height });
      }, 'image/jpeg', 0.85);
    });
  }

  // blob을 base64(헤더 제외)로
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () {
        var s = r.result;
        var i = s.indexOf(',');
        res(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
  }
  function base64ToBlob(b64, mime) {
    var bin = atob(b64), len = bin.length, arr = new Uint8Array(len);
    for (var i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime || 'image/jpeg' });
  }

  // 로컬 photos 스토어에 저장/조회 (blob 보관 — 오프라인 열람용)
  function savePhoto(id, blob) {
    return DB.put('photos', { id: id, blob: blob, at: U.now() });
  }
  function getPhoto(id) { return DB.get('photos', id); }
  function photoObjectUrl(id) {
    return getPhoto(id).then(function (p) { return p && p.blob ? URL.createObjectURL(p.blob) : ''; });
  }

  return {
    processFile: processFile, blobToImage: blobToImage, drawToBlob: drawToBlob,
    blobToBase64: blobToBase64, base64ToBlob: base64ToBlob,
    savePhoto: savePhoto, getPhoto: getPhoto, photoObjectUrl: photoObjectUrl
  };
})();
