/** Checks the news form makes before saving (T04). */
export const NEWS_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const NEWS_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const isNewsImage = (file: File) =>
  NEWS_IMAGE_TYPES.includes(file.type) && file.size <= NEWS_IMAGE_MAX_BYTES;

export const isValidNews = (draft: { title: string; body: string }) =>
  draft.title.trim().length >= 3 && draft.title.trim().length <= 140 && draft.body.trim() !== "";
