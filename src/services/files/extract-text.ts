import "server-only";
import { AppError } from "../../lib/api.ts";
import {
  MAX_EXTRACTED_CHARACTERS,
  isImageFile,
  type FileImportResult,
} from "../../schemas/attachment.ts";
import { decodeText, validateFile } from "./validate-file.ts";

export async function extractFile(file: File): Promise<FileImportResult> {
  const { data, extension, name, mimeType, size } = await validateFile(file);
  if (isImageFile(name))
    return {
      title: name.replace(/\.[^.]+$/, "").slice(0, 100),
      content: "",
      attachment: { name, mimeType, size },
      warning:
        "图片已就绪。可点击「AI 解析图片」识别内容，或手动填写正文后保存原图。",
    };
  let content: string;
  try {
    if (extension === "pdf") {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({
        data: Uint8Array.from(data),
        isEvalSupported: false,
        useSystemFonts: true,
      });
      try {
        const info = await parser.getInfo();
        if (info.total > 100)
          throw new AppError(
            "TOO_MANY_PAGES",
            "PDF 超过 100 页，请拆分后再导入",
            413,
          );
        const result = await parser.getText();
        content = result.pages.map((page) => page.text).join("\n\n");
      } finally {
        await parser.destroy();
      }
    } else if (extension === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: data });
      if (result.messages.some((message) => message.type === "error"))
        throw new AppError(
          "FILE_PARSE_ERROR",
          "Word 文件部分内容无法读取，请检查文件后重新导入",
          422,
        );
      content = result.value;
    } else {
      content = decodeText(data);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "PasswordException")
      throw new AppError(
        "ENCRYPTED_FILE",
        "文件有密码保护，请解密后再导入",
        422,
      );
    throw new AppError(
      "FILE_PARSE_ERROR",
      "无法提取文件文字，请检查文件是否损坏或受密码保护",
      422,
    );
  }
  content = content
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .trim();
  if (content.length > MAX_EXTRACTED_CHARACTERS)
    throw new AppError(
      "TEXT_TOO_LONG",
      "提取文字超过 20,000 字，请拆分文件后再导入；当前正文没有被修改",
      413,
    );
  return {
    title: name.replace(/\.[^.]+$/, "").slice(0, 100) || "未命名资料",
    content,
    attachment: { name, mimeType, size },
    warning: content
      ? null
      : extension === "pdf"
        ? "未提取到文字，这可能是扫描版 PDF。原文件可以保留，请手动填写正文后保存；暂不支持 OCR。"
        : "文件没有可提取的文字。原文件可以保留，请手动填写正文后保存。",
  };
}
