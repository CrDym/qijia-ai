export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 20000;
export const FILE_ACCEPT =
  ".pdf,.docx,.txt,.md,.markdown,.jpg,.jpeg,.png,.webp";
export const FILE_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
} as const;
export const isImageFile = (name: string) => /\.(jpe?g|png|webp)$/i.test(name);
export type FileExtension = keyof typeof FILE_TYPES;
export type AttachmentMeta = { name: string; mimeType: string; size: number };
export type FileImportResult = {
  title: string;
  content: string;
  attachment: AttachmentMeta;
  warning: string | null;
};

export function fileExtension(name: string): FileExtension | null {
  const extension = name.split(".").pop()?.toLowerCase();
  return extension && Object.hasOwn(FILE_TYPES, extension)
    ? (extension as FileExtension)
    : null;
}

export function formatFileSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.ceil(size / 1024))} KB`;
}
