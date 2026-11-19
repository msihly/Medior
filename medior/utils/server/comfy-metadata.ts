import fs from "fs/promises";
import { extname } from "path";
import { promisify } from "util";
import { inflate } from "zlib";
import { readId3UserTexts } from "medior/utils/server/id3";

/** The prompt and workflow ComfyUI saved into a file, as the JSON text it wrote. */
export interface ComfyMetadata {
  prompt?: string;
  workflow?: string;
}

/** An element's or box's content, from its first byte to the byte after its last. */
interface ContentRange {
  end: number;
  start: number;
}

/** A Matroska element's ID, and its size, which is null when the muxer left it unknown. */
interface EbmlElement {
  dataStart: number;
  id: number;
  size: number;
}

type Read = (position: number, length: number) => Promise<Buffer>;

type TextReader = (read: Read, size: number) => Promise<Map<string, string>>;

const inflateAsync = promisify(inflate);

const EBML = {
  CLUSTER: 0x1f43b675,
  HEADER: 0x1a45dfa3,
  SEEK: 0x4dbb,
  SEEK_HEAD: 0x114d9b74,
  SEEK_ID: 0x53ab,
  SEEK_POSITION: 0x53ac,
  SEGMENT: 0x18538067,
  SIMPLE_TAG: 0x67c8,
  TAG: 0x7373,
  TAG_NAME: 0x45a3,
  TAG_STRING: 0x4487,
  TAGS: 0x1254c367,
};

/** The most bytes an element header takes: a 4-byte ID and an 8-byte size. */
const EBML_HEADER_SIZE = 12;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** ComfyUI writes tEXt chunks into still PNGs and comf chunks after the frames of animated ones; its frontend also reads iTXt. */
const PNG_TEXT_CHUNKS = new Set(["comf", "iTXt", "tEXt"]);

/* -------------------------------------------------------------------------- */
/*                                   HELPERS                                  */
/* -------------------------------------------------------------------------- */
/** A Matroska variable-size integer's length, from the leading zeros of its first byte, or 0 when it's invalid. */
const getVintLength = (byte: number) => {
  const length = Math.clz32(byte) - 23;

  return length >= 1 && length <= 8 ? length : 0;
};

/** The box of this type among the boxes in the range, which ISOBMFF sizes with 32 bits, 64 bits after the type when 1, or to the end when 0. */
const findBox = async (read: Read, range: ContentRange, type: string): Promise<ContentRange> => {
  for (let offset = range.start; offset + 8 <= range.end;) {
    const header = await read(offset, 16);
    if (header.length < 8) return null;

    const sizeField = header.readUInt32BE(0);
    if (sizeField === 1 && header.length < 16) return null;

    const headerSize = sizeField === 1 ? 16 : 8;
    const size =
      sizeField === 1
        ? Number(header.readBigUInt64BE(8))
        : sizeField === 0
          ? range.end - offset
          : sizeField;

    if (size < headerSize || offset + size > range.end) return null;

    if (header.toString("latin1", 4, 8) === type)
      return { end: offset + size, start: offset + headerSize };

    offset += size;
  }

  return null;
};

/** Reads within a buffer as a file is read, so boxes found in either are walked alike. */
const makeBufferRead =
  (buffer: Buffer): Read =>
  async (position, length) =>
    buffer.subarray(position, position + length);

/** A Matroska element header at the offset, or null when it can't be read. */
const readEbmlElement = (buffer: Buffer, offset: number): EbmlElement => {
  const idLength = getVintLength(buffer[offset]);
  const sizeLength = idLength ? getVintLength(buffer[offset + idLength]) : 0;

  if (!idLength || idLength > 4 || !sizeLength || offset + idLength + sizeLength > buffer.length)
    return null;

  const sizeStart = offset + idLength;
  let size = buffer[sizeStart] & (0xff >> sizeLength);
  let isUnknown = size === 0xff >> sizeLength;

  for (let index = 1; index < sizeLength; index++) {
    size = size * 256 + buffer[sizeStart + index];
    isUnknown &&= buffer[sizeStart + index] === 0xff;
  }

  return {
    dataStart: sizeStart + sizeLength,
    id: buffer.readUIntBE(offset, idLength),
    size: isUnknown ? null : size,
  };
};

/** The child elements in the range of a buffer, up to one that can't be read or runs past it. */
const readEbmlElements = (buffer: Buffer, range: ContentRange) => {
  const elements: EbmlElement[] = [];

  for (let offset = range.start; offset < range.end;) {
    const element = readEbmlElement(buffer, offset);
    if (!element || element.size === null || element.dataStart + element.size > range.end) break;

    elements.push(element);
    offset = element.dataStart + element.size;
  }

  return elements;
};

const getEbmlRange = (element: EbmlElement): ContentRange => ({
  end: element.dataStart + element.size,
  start: element.dataStart,
});

/** A Matroska unsigned integer element's value, of up to 8 bytes, which file positions read exactly as numbers. */
const readEbmlUInt = (buffer: Buffer, element: EbmlElement) =>
  buffer
    .subarray(element.dataStart, element.dataStart + element.size)
    .reduce((value, byte) => value * 256 + byte, 0);

/** Adds a Matroska simple tag's name and string, and those of the simple tags nested in it. */
const readSimpleTag = (buffer: Buffer, simpleTag: EbmlElement, texts: Map<string, string>) => {
  const children = readEbmlElements(buffer, getEbmlRange(simpleTag));
  const name = children.find((child) => child.id === EBML.TAG_NAME);
  const value = children.find((child) => child.id === EBML.TAG_STRING);

  if (name && value)
    texts.set(
      buffer.toString("utf8", name.dataStart, name.dataStart + name.size),
      buffer.toString("utf8", value.dataStart, value.dataStart + value.size).replace(/\0+$/, ""),
    );

  for (const child of children)
    if (child.id === EBML.SIMPLE_TAG) readSimpleTag(buffer, child, texts);
};

/** ComfyUI writes each value into an ASCII tag of EXIF's first IFD as "key:json", Model for the prompt and Make counting down for the rest. */
const readExifTexts = (exif: Buffer, texts: Map<string, string>) => {
  const tiff = exif.toString("latin1", 0, 6) === "Exif\0\0" ? exif.subarray(6) : exif;
  const byteOrder = tiff.toString("latin1", 0, 2);
  if (tiff.length < 8 || (byteOrder !== "II" && byteOrder !== "MM")) return;

  const isLittleEndian = byteOrder === "II";

  const readUInt16 = (offset: number) =>
    isLittleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);

  const readUInt32 = (offset: number) =>
    isLittleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);

  const ifdOffset = readUInt32(4);
  if (ifdOffset + 2 > tiff.length) return;

  const entryCount = readUInt16(ifdOffset);

  for (let index = 0; index < entryCount; index++) {
    const entry = ifdOffset + 2 + index * 12;
    if (entry + 12 > tiff.length) break;

    // Type 2 is ASCII; values of up to 4 bytes sit in the entry itself.
    const count = readUInt32(entry + 4);
    const start = count <= 4 ? entry + 8 : readUInt32(entry + 8);

    if (readUInt16(entry + 2) === 2 && start + count <= tiff.length) {
      const value = tiff.toString("utf8", start, start + count).replace(/\0+$/, "");
      const separator = value.indexOf(":");

      if (separator > 0) texts.set(value.slice(0, separator), value.slice(separator + 1));
    }
  }
};

/** An iTXt chunk's text, after its keyword, compression, language, and translated keyword, inflated when compressed; null when it can't be read, as ComfyUI's frontend skips it. */
const readItxtText = async (data: Buffer, keywordEnd: number) => {
  const isCompressed = data[keywordEnd + 1] === 1;
  const languageEnd = data.indexOf(0, keywordEnd + 3);
  const translatedKeywordEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);

  if (translatedKeywordEnd < 0 || (isCompressed && data[keywordEnd + 2] !== 0)) return null;

  const text = data.subarray(translatedKeywordEnd + 1);

  try {
    return (isCompressed ? await inflateAsync(text) : text).toString("utf8");
  } catch {
    return null;
  }
};

/** Adds the comments of a Vorbis comment block, as FLAC and Ogg Vorbis and Opus store them, each "KEY=value". */
const readVorbisComments = (block: Buffer, texts: Map<string, string>) => {
  if (block.length < 8) return;

  let offset = 4 + block.readUInt32LE(0);
  if (offset + 4 > block.length) return;

  const count = block.readUInt32LE(offset);
  offset += 4;

  for (let index = 0; index < count && offset + 4 <= block.length; index++) {
    const length = block.readUInt32LE(offset);
    const comment = block.toString("utf8", offset + 4, Math.min(offset + 4 + length, block.length));
    const separator = comment.indexOf("=");

    if (separator > 0) texts.set(comment.slice(0, separator), comment.slice(separator + 1));

    offset += 4 + length;
  }
};

/* -------------------------------------------------------------------------- */
/*                                   READERS                                  */
/* -------------------------------------------------------------------------- */
/** FLAC's Vorbis comment block, the metadata block of type 4. */
const readFlacTexts: TextReader = async (read, size) => {
  const texts = new Map<string, string>();
  if ((await read(0, 4)).toString("latin1") !== "fLaC") return texts;

  for (let offset = 4; offset + 4 <= size;) {
    const header = await read(offset, 4);
    if (header.length < 4) break;

    const isLast = (header[0] & 0x80) !== 0;
    const length = header.readUIntBE(1, 3);

    if ((header[0] & 0x7f) === 4) {
      readVorbisComments(await read(offset + 4, length), texts);
      break;
    } else if (isLast) break;

    offset += 4 + length;
  }

  return texts;
};

/** The udta box of the movie box, or at the top level, holding the meta box's keys and item list that ffmpeg writes custom tags to. */
const readIsobmffTexts: TextReader = async (read, size) => {
  const texts = new Map<string, string>();
  const file = { end: size, start: 0 };
  const movie = await findBox(read, file, "moov");
  const userData =
    (movie && (await findBox(read, movie, "udta"))) ?? (await findBox(read, file, "udta"));
  const meta = userData && (await findBox(read, userData, "meta"));
  if (!meta) return texts;

  const content = await read(meta.start, meta.end - meta.start);
  const readContent = makeBufferRead(content);
  // ISO's meta box starts with a version and flags, which QuickTime's leaves out before its handler.
  const children = {
    end: content.length,
    start: content.toString("latin1", 4, 8) === "hdlr" ? 0 : 4,
  };
  const keys = await findBox(readContent, children, "keys");
  const items = await findBox(readContent, children, "ilst");
  if (!keys || !items || keys.end - keys.start < 8) return texts;

  const keyCount = content.readUInt32BE(keys.start + 4);
  const names: string[] = [];

  for (
    let index = 0, offset = keys.start + 8;
    index < keyCount && offset + 8 <= keys.end;
    index++
  ) {
    const keySize = content.readUInt32BE(offset);
    if (keySize < 8 || offset + keySize > keys.end) break;

    names.push(content.toString("utf8", offset + 8, offset + keySize));
    offset += keySize;
  }

  // Each item's type is the 1-based index of its key, and its value follows a data box's type and locale.
  for (let offset = items.start; offset + 8 <= items.end;) {
    const itemSize = content.readUInt32BE(offset);
    if (itemSize < 8 || offset + itemSize > items.end) break;

    const name = names[content.readUInt32BE(offset + 4) - 1];
    const data =
      name && (await findBox(readContent, { end: offset + itemSize, start: offset + 8 }, "data"));

    if (data && data.end - data.start >= 8)
      texts.set(name, content.toString("utf8", data.start + 8, data.end));

    offset += itemSize;
  }

  return texts;
};

/**
 * Matroska's tags, from the top-level elements up to the first cluster and from wherever the seek head says they are, so clusters are never walked.
 * Elements of unknown size end the walk, since what follows them can't be found without reading them.
 */
const readMatroskaTexts: TextReader = async (read, size) => {
  const texts = new Map<string, string>();
  const header = readEbmlElement(await read(0, EBML_HEADER_SIZE), 0);
  if (header?.id !== EBML.HEADER || header.size === null) return texts;

  const segmentOffset = header.dataStart + header.size;
  const segment = readEbmlElement(await read(segmentOffset, EBML_HEADER_SIZE), 0);
  if (segment?.id !== EBML.SEGMENT) return texts;

  const segmentStart = segmentOffset + segment.dataStart;
  const segmentEnd = segment.size === null ? size : Math.min(size, segmentStart + segment.size);
  const readPositions = new Set<number>();
  const seekPositions: number[] = [];

  const readElementAt = async (offset: number) =>
    readEbmlElement(await read(offset, EBML_HEADER_SIZE), 0);

  const readTags = async (offset: number, element: EbmlElement) => {
    const content = await read(offset + element.dataStart, element.size);

    readPositions.add(offset - segmentStart);

    for (const tag of readEbmlElements(content, { end: content.length, start: 0 }))
      if (tag.id === EBML.TAG)
        for (const child of readEbmlElements(content, getEbmlRange(tag)))
          if (child.id === EBML.SIMPLE_TAG) readSimpleTag(content, child, texts);
  };

  for (let offset = segmentStart; offset < segmentEnd;) {
    const element = await readElementAt(offset);
    if (!element || element.size === null || element.id === EBML.CLUSTER) break;

    if (element.id === EBML.TAGS) await readTags(offset, element);
    else if (element.id === EBML.SEEK_HEAD) {
      const content = await read(offset + element.dataStart, element.size);

      for (const seek of readEbmlElements(content, { end: content.length, start: 0 })) {
        const fields = seek.id === EBML.SEEK ? readEbmlElements(content, getEbmlRange(seek)) : [];
        const id = fields.find((field) => field.id === EBML.SEEK_ID);
        const position = fields.find((field) => field.id === EBML.SEEK_POSITION);

        if (id && position?.size <= 8 && readEbmlUInt(content, id) === EBML.TAGS)
          seekPositions.push(readEbmlUInt(content, position));
      }
    }

    offset += element.dataStart + element.size;
  }

  for (const position of seekPositions) {
    const offset = segmentStart + position;
    const element =
      !readPositions.has(position) && offset < segmentEnd && (await readElementAt(offset));

    if (element && element.id === EBML.TAGS && element.size !== null)
      await readTags(offset, element);
  }

  return texts;
};

/** The comment header, an Ogg stream's second packet, which spans as many pages as its size needs. */
const readOggTexts: TextReader = async (read, size) => {
  const packets: Buffer[] = [];
  const texts = new Map<string, string>();
  let parts: Buffer[] = [];
  let serial: number = null;

  for (let offset = 0; offset + 27 <= size && packets.length < 2;) {
    const header = await read(offset, 27);
    if (header.toString("latin1", 0, 4) !== "OggS") break;

    const segmentCount = header[26];
    const lacing = await read(offset + 27, segmentCount);
    const dataLength = lacing.reduce((total, value) => total + value, 0);
    const pageSerial = header.readUInt32LE(14);

    serial ??= pageSerial;

    // Pages of other streams in the same file are skipped; a segment shorter than 255 bytes ends its packet.
    if (pageSerial === serial) {
      const data = await read(offset + 27 + segmentCount, dataLength);
      let position = 0;

      for (const value of lacing) {
        parts.push(data.subarray(position, position + value));
        position += value;

        if (value < 255) {
          packets.push(Buffer.concat(parts));
          parts = [];
        }
      }
    }

    offset += 27 + segmentCount + dataLength;
  }

  const comments = packets[1];

  if (comments?.toString("latin1", 0, 8) === "OpusTags")
    readVorbisComments(comments.subarray(8), texts);
  else if (comments?.toString("latin1", 0, 7) === "\x03vorbis")
    readVorbisComments(comments.subarray(7), texts);

  return texts;
};

/** PNG text chunks, each a keyword ending at a null byte before its text. */
const readPngTexts: TextReader = async (read, size) => {
  const texts = new Map<string, string>();
  if (!(await read(0, 8)).equals(PNG_SIGNATURE)) return texts;

  for (let offset = 8; offset + 8 <= size;) {
    const header = await read(offset, 8);
    const length = header.readUInt32BE(0);
    const type = header.toString("latin1", 4, 8);

    if (type === "IEND" || offset + 12 + length > size) break;

    if (PNG_TEXT_CHUNKS.has(type)) {
      const data = await read(offset + 8, length);
      const keywordEnd = data.indexOf(0);

      if (keywordEnd > 0) {
        const text =
          type === "iTXt"
            ? await readItxtText(data, keywordEnd)
            : data.toString("utf8", keywordEnd + 1);

        if (text !== null) texts.set(data.toString("latin1", 0, keywordEnd), text);
      }
    }

    offset += 12 + length;
  }

  return texts;
};

/** WebP's EXIF chunk, found among the RIFF chunks, which pad to an even length. */
const readWebpTexts: TextReader = async (read, size) => {
  const texts = new Map<string, string>();
  const header = await read(0, 12);

  if (header.toString("latin1", 0, 4) !== "RIFF" || header.toString("latin1", 8, 12) !== "WEBP")
    return texts;

  for (let offset = 12; offset + 8 <= size;) {
    const chunk = await read(offset, 8);
    const length = chunk.readUInt32LE(4);

    if (chunk.toString("latin1", 0, 4) === "EXIF") {
      readExifTexts(await read(offset + 8, length), texts);
      break;
    }

    offset += 8 + length + (length % 2);
  }

  return texts;
};

/** How a file of each extension holds the prompt and workflow ComfyUI saved into it. */
const TEXT_READERS: Record<string, TextReader> = {
  apng: readPngTexts,
  flac: readFlacTexts,
  m4v: readIsobmffTexts,
  mkv: readMatroskaTexts,
  mov: readIsobmffTexts,
  mp4: readIsobmffTexts,
  ogg: readOggTexts,
  opus: readOggTexts,
  png: readPngTexts,
  webm: readMatroskaTexts,
  webp: readWebpTexts,
};

/** Extensions of the files ComfyUI saves its prompt and workflow into. */
export const COMFY_METADATA_EXTS = new Set([...Object.keys(TEXT_READERS), "mp3"]);

/**
 * The prompt and workflow ComfyUI saved into the file, by the names it stores them under in any letter case.
 * Only the headers, chunks, and boxes that hold them are read, as reads bounded by the file's size.
 */
export const readComfyMetadata = async (filePath: string): Promise<ComfyMetadata> => {
  const ext = extname(filePath).slice(1).toLowerCase();
  if (!COMFY_METADATA_EXTS.has(ext)) return {};

  let texts: Map<string, string>;

  if (ext === "mp3") texts = await readId3UserTexts(filePath);
  else {
    const file = await fs.open(filePath, "r");

    try {
      const { size } = await file.stat();

      const read: Read = async (position, length) => {
        const buffer = Buffer.alloc(Math.max(0, Math.min(length, size - position)));
        const { bytesRead } = await file.read(buffer, 0, buffer.length, position);

        return buffer.subarray(0, bytesRead);
      };

      texts = await TEXT_READERS[ext](read, size);
    } finally {
      await file.close();
    }
  }

  const getText = (key: string) =>
    [...texts].find(([name]) => name.trim().toLowerCase() === key)?.[1];

  return { prompt: getText("prompt"), workflow: getText("workflow") };
};
