import { ACCEPTED_MIME_TYPES } from './files.types';

const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles|EmbeddedFile|RichMedia|SubmitForm|ImportData|GoToR|Rendition|ObjStm)\b/i;

export class FileContentError extends Error {
  constructor(message: string) { super(message); this.name = 'FileContentError'; }
}

export async function sniffAllowedMime(prefix: Uint8Array, declaredMime: string): Promise<string> {
  const packageName: string = 'file-type';
  const parser = await import(packageName) as { fileTypeFromBuffer(value: Uint8Array): Promise<{ mime: string } | undefined> };
  const fileTypeFromBuffer = parser.fileTypeFromBuffer;
  const detected = await fileTypeFromBuffer(prefix);
  let actual = detected?.mime === 'audio/x-m4a' || looksLikeAudioMp4(prefix)
    ? 'audio/mp4'
    : detected?.mime;
  if (!actual && looksLikePdf(prefix)) actual = 'application/pdf';
  if (!actual || !ACCEPTED_MIME_TYPES.has(actual)) throw new FileContentError('Unknown or disallowed file content');
  if (actual !== declaredMime) throw new FileContentError('Declared MIME does not match file content');
  return actual;
}

export function validatePdfActiveTokens(content: Uint8Array): void {
  if (!looksLikePdf(content)) return;
  // This rejects active PDF actions in the object syntax we inspect. The PDF is
  // always stored and served as an attachment; ClamAV remains mandatory.
  validatePdfActiveText(new TextDecoder('latin1').decode(content));
}

export function validatePdfActiveText(text: string): void {
  const decodedNames = text.replace(/#([a-f0-9]{2})/gi, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
  if (PDF_ACTIVE_CONTENT.test(decodedNames)) throw new FileContentError('PDF active content or compressed object stream is not accepted');
}

function looksLikePdf(value: Uint8Array): boolean {
  return new TextDecoder('ascii').decode(value.subarray(0, 8)).startsWith('%PDF-');
}

function looksLikeAudioMp4(value: Uint8Array): boolean {
  if (value.length < 12) return false;
  const brand = new TextDecoder('ascii').decode(value.subarray(8, 12));
  return new TextDecoder('ascii').decode(value.subarray(4, 8)) === 'ftyp'
    && ['M4A ', 'M4B ', 'mp4a'].includes(brand);
}
