import "server-only";
import sharp from "sharp";
import { AppError } from "../../lib/api.ts";
import {
  FILE_TYPES,
  MAX_FILE_BYTES,
  fileExtension,
  isImageFile,
  type AttachmentMeta,
  type FileExtension,
} from "../../schemas/attachment.ts";

export type AttachmentData = AttachmentMeta & { data: Buffer };

export async function validateFile(
  file: File,
): Promise<AttachmentData & { extension: FileExtension }> {
  if (!file.size)
    throw new AppError("EMPTY_FILE", "文件为空，请选择有内容的文件");
  if (file.size > MAX_FILE_BYTES)
    throw new AppError("TOO_LARGE", "单个文件不能超过 10 MB", 413);
  const extension = fileExtension(file.name);
  if (!extension)
    throw new AppError(
      "UNSUPPORTED_FILE",
      "请上传 JPG、PNG、WebP、PDF、Word（.docx）、TXT 或 Markdown 文件",
      415,
    );
  const data = Buffer.from(await file.arrayBuffer());
  if (isImageFile(file.name)) {
    try {
      const image = sharp(data, {
        limitInputPixels: 40_000_000,
        failOn: "warning",
      });
      const metadata = await image.metadata();
      const expected =
        extension === "jpg" || extension === "jpeg" ? "jpeg" : extension;
      if (metadata.format !== expected || (metadata.pages ?? 1) !== 1)
        throw new Error("Invalid image format");
      // 完整解码，不能只凭后缀或文件头接受损坏的图片。
      await image.stats();
    } catch {
      throw new AppError(
        "INVALID_IMAGE",
        "图片无效、已损坏或尺寸过大。请使用 4,000 万像素以内的静态 JPG、PNG 或 WebP 图片",
        422,
      );
    }
  }
  if (extension === "pdf" && !data.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new AppError(
      "INVALID_FILE",
      "文件内容不是有效的 PDF，请检查文件是否损坏",
    );
  if (extension === "docx") validateDocxContainer(data);
  if (extension === "txt" || extension === "md" || extension === "markdown")
    decodeText(data);
  const name = file.name
    .normalize("NFC")
    .replace(/[/\\\x00-\x1f\x7f]/g, "_")
    .slice(-180)
    .toWellFormed();
  return {
    name,
    mimeType: FILE_TYPES[extension],
    size: data.length,
    data,
    extension,
  };
}

export function decodeText(data: Buffer): string {
  const utf16le = data[0] === 0xff && data[1] === 0xfe;
  const utf16be = data[0] === 0xfe && data[1] === 0xff;
  let text: string;
  try {
    text = new TextDecoder(
      utf16le ? "utf-16le" : utf16be ? "utf-16be" : "utf-8",
      { fatal: true },
    ).decode(data);
  } catch {
    throw new AppError(
      "TEXT_ENCODING",
      "无法读取文字编码，请将文件另存为 UTF-8 或带 BOM 的 UTF-16 后重试",
    );
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
    throw new AppError(
      "INVALID_FILE",
      "文件包含二进制内容，请上传真正的文字文件",
    );
  return text;
}

// DOCX 是 ZIP 容器。先检查目录与展开大小，再交给解析库。
function validateDocxContainer(data: Buffer) {
  const invalid = () =>
    new AppError(
      "INVALID_FILE",
      "无法读取 Word 文件，请确认是有效的 .docx 文件",
    );
  if (data.length < 22 || data.readUInt32LE(0) !== 0x04034b50) throw invalid();
  let end = -1;
  for (
    let offset = data.length - 22;
    offset >= Math.max(0, data.length - 65557);
    offset--
  ) {
    if (
      data.readUInt32LE(offset) === 0x06054b50 &&
      offset + 22 + data.readUInt16LE(offset + 20) === data.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw invalid();
  const entries = data.readUInt16LE(end + 10);
  let offset = data.readUInt32LE(end + 16);
  let total = 0;
  let hasDocument = false;
  if (entries > 2000)
    throw new AppError(
      "COMPLEX_FILE",
      "Word 文件内容过多，请拆分后再导入",
      413,
    );
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50)
      throw invalid();
    if (data.readUInt16LE(offset + 8) & 1)
      throw new AppError("ENCRYPTED_FILE", "请先移除 Word 文件的密码保护");
    total += data.readUInt32LE(offset + 24);
    if (total > 32 * 1024 * 1024)
      throw new AppError(
        "COMPLEX_FILE",
        "Word 文件展开后过大，请精简内容或拆分后再导入",
        413,
      );
    const nameLength = data.readUInt16LE(offset + 28);
    const extraLength = data.readUInt16LE(offset + 30);
    const commentLength = data.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end) throw invalid();
    if (
      data.toString("utf8", offset + 46, offset + 46 + nameLength) ===
      "word/document.xml"
    )
      hasDocument = true;
    offset = next;
  }
  if (!hasDocument) throw invalid();
}
