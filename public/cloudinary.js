// ============================================================
// cloudinary.js — رفع الصور والفيديوهات مباشرة من المتصفح إلى Cloudinary
// ============================================================
// لماذا Cloudinary بدل تخزين الصور Base64 داخل Firestore؟
// لأن Firestore له حد أقصى 1MB لكل مستند، والصور/الفيديوهات أكبر من
// ذلك بسهولة. لذلك نرفعها إلى Cloudinary (تخزين ملفات مجاني) ونحفظ
// فقط "رابط" الملف الناتج داخل بيانات النظام في Firestore.
//
// خطوات الإعداد (مرة واحدة فقط):
// 1) أنشئ حسابًا مجانيًا في https://cloudinary.com
// 2) من لوحة التحكم (Dashboard) انسخ "Cloud Name" وضعه أدناه.
// 3) من: Settings (⚙) > Upload > Upload presets > Add upload preset
//      - Signing Mode: اختر "Unsigned" (مهم جدًا)
//      - احفظ واسمه (مثلاً: awda_unsigned) وضع الاسم أدناه.
// 4) هذا يكفي — الرفع سيتم مباشرة من المتصفح بدون أي خادم Node.
// ============================================================

const CLOUDINARY_CLOUD_NAME = "yc8eiyrw";
const CLOUDINARY_UPLOAD_PRESET = "wxz6afj3";

/**
 * يرفع ملف (صورة أو فيديو) إلى Cloudinary ويرجع رابطه النهائي.
 * @param {File} file
 * @param {(percent:number)=>void} [onProgress] دالة اختيارية لعرض نسبة الرفع
 * @returns {Promise<{url:string, type:'image'|'video', name:string}>}
 */
function uploadToCloudinary(file, onProgress) {
  return new Promise((resolve, reject) => {
    const isVideo = file.type.startsWith('video');
    const resourceType = isVideo ? 'video' : 'image';
    const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);

    xhr.upload.onprogress = (e) => {
      if (onProgress && e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.secure_url) {
          resolve({ url: res.secure_url, type: resourceType, name: file.name });
        } else {
          reject(new Error(res.error?.message || 'فشل رفع الملف إلى Cloudinary'));
        }
      } catch (e) {
        reject(e);
      }
    };

    xhr.onerror = () => reject(new Error('تعذر الاتصال بـ Cloudinary — تحقق من الإنترنت'));
    xhr.send(formData);
  });
}

/**
 * يرفع عدة ملفات بالتتابع ويرجع مصفوفة النتائج بنفس الترتيب.
 * @param {File[]} files
 * @param {(index:number, percent:number)=>void} [onProgress]
 */
async function uploadMultipleToCloudinary(files, onProgress) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const r = await uploadToCloudinary(files[i], (p) => onProgress && onProgress(i, p));
    results.push(r);
  }
  return results;
}
