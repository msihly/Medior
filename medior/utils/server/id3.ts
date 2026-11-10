import fs from "fs/promises";

const FRAME_HEADER_SIZE = 10;
const TAG_HEADER_SIZE = 10;

/**
 * The POPM rating byte written for each Medior rating, by half stars: ½★ is 1 through 4½★ is 9,
 * and 5★ is 9 too. Other bytes read as the closest of these.
 */
const POPM_RATINGS: [byte: number, rating: number][] = [
  [1, 2],
  [13, 1],
  [54, 3],
  [64, 4],
  [118, 5],
  [128, 6],
  [186, 7],
  [196, 8],
  [242, 9],
  [255, 9],
];

/** ID3v2.3 frame flags that put bytes ahead of a frame's content, or leave it unreadable. */
const V3_COMPRESSED = 0x80;
const V3_ENCRYPTED = 0x40;
const V3_GROUPED = 0x20;

/** ID3v2.4 frame flags that put bytes ahead of a frame's content, or leave it unreadable. */
const V4_GROUPED = 0x40;
const V4_COMPRESSED = 0x08;
const V4_ENCRYPTED = 0x04;
const V4_UNSYNCHRONISED = 0x02;
const V4_LENGTH_INDICATED = 0x01;

/**
 * An ID3v2.4 frame's size: seven bits per byte as the standard writes it, or a plain number as some
 * taggers wrote it when one of its bytes has its top bit set, which a seven-bit size never does.
 * Plain sizes without such a byte still read as seven-bit ones.
 */
const readFrameSize = (buffer: Buffer, offset: number) =>
  buffer.subarray(offset, offset + 4).some((byte) => byte & 0x80)
    ? buffer.readUInt32BE(offset)
    : readSyncSafe(buffer, offset);

/** Seven bits per byte, as ID3v2 tag sizes and ID3v2.4 frame sizes are written. */
const readSyncSafe = (buffer: Buffer, offset: number) =>
  (buffer[offset] << 21) |
  (buffer[offset + 1] << 14) |
  (buffer[offset + 2] << 7) |
  buffer[offset + 3];

/** Restores bytes unsynchronisation wrote as FF 00 to keep false sync signals out of the tag. */
const resynchronise = (buffer: Buffer) => {
  const restored = Buffer.alloc(buffer.length);
  let length = 0;

  for (let index = 0; index < buffer.length; index++) {
    restored[length++] = buffer[index];

    if (buffer[index] === 0xff && buffer[index + 1] === 0x00) index++;
  }

  return restored.subarray(0, length);
};

/**
 * A POPM frame's rating byte, which follows the player email's terminating null. A play counter may
 * follow the rating.
 */
const readPopularimeterRating = (content: Buffer) => {
  const emailEnd = content.indexOf(0);
  return emailEnd < 0 || emailEnd + 1 >= content.length ? null : content[emailEnd + 1];
};

/**
 * The first rating byte an ID3v2.3 or ID3v2.4 tag at the start of a file holds in a POPM frame,
 * whichever player wrote it. Only frame headers and POPM frames are read, so cover art and other
 * large frames are skipped over. Null when the file has no such rating.
 */
const readPopularimeterByte = async (filePath: string) => {
  const file = await fs.open(filePath, "r");

  try {
    const header = Buffer.alloc(TAG_HEADER_SIZE);
    const { bytesRead } = await file.read(header, 0, TAG_HEADER_SIZE, 0);

    if (bytesRead < TAG_HEADER_SIZE || header.toString("latin1", 0, 3) !== "ID3") return null;

    const version = header[3];
    const tagFlags = header[5];
    // A damaged tag's size can run past the file, which bounds what's read.
    const tagSize = Math.min(readSyncSafe(header, 6), (await file.stat()).size - TAG_HEADER_SIZE);

    if (version !== 3 && version !== 4) return null;

    // An unsynchronised tag can only be read whole, so a frame's bytes line up with its header.
    const isTagUnsynchronised = (tagFlags & 0x80) !== 0;
    let tag: Buffer = null;

    if (isTagUnsynchronised) {
      tag = Buffer.alloc(tagSize);
      await file.read(tag, 0, tagSize, TAG_HEADER_SIZE);

      if (version === 3) tag = resynchronise(tag);
    }

    const read = async (offset: number, length: number) => {
      if (tag) return tag.subarray(offset, offset + length);
      else {
        const buffer = Buffer.alloc(length);
        const res = await file.read(buffer, 0, length, TAG_HEADER_SIZE + offset);

        return buffer.subarray(0, res.bytesRead);
      }
    };

    const tagLength = tag ? tag.length : tagSize;
    let offset = 0;

    // The extended header's size counts itself in ID3v2.4, but not in ID3v2.3.
    if (tagFlags & 0x40) {
      const extended = await read(0, 4);
      if (extended.length < 4) return null;

      offset = version === 4 ? readSyncSafe(extended, 0) : extended.readUInt32BE(0) + 4;
    }

    while (offset + FRAME_HEADER_SIZE <= tagLength) {
      const frameHeader = await read(offset, FRAME_HEADER_SIZE);

      // Padding follows the last frame.
      if (frameHeader.length < FRAME_HEADER_SIZE || frameHeader[0] === 0) break;

      const id = frameHeader.toString("latin1", 0, 4);
      const size = version === 4 ? readFrameSize(frameHeader, 4) : frameHeader.readUInt32BE(4);
      const flags = frameHeader[9];

      // A frame running past the tag means the tag is damaged from there on.
      if (offset + FRAME_HEADER_SIZE + size > tagLength) break;

      if (id === "POPM") {
        const isUnreadable =
          version === 4
            ? (flags & (V4_COMPRESSED | V4_ENCRYPTED)) !== 0
            : (flags & (V3_COMPRESSED | V3_ENCRYPTED)) !== 0;
        const skippedCount =
          version === 4
            ? ((flags & V4_GROUPED) !== 0 ? 1 : 0) + ((flags & V4_LENGTH_INDICATED) !== 0 ? 4 : 0)
            : (flags & V3_GROUPED) !== 0
              ? 1
              : 0;

        // ID3v2.4 unsynchronises each frame, which a whole unsynchronised tag marks every one as.
        const isFrameUnsynchronised =
          version === 4 && (isTagUnsynchronised || (flags & V4_UNSYNCHRONISED) !== 0);

        if (!isUnreadable) {
          const content = (await read(offset + FRAME_HEADER_SIZE, size)).subarray(skippedCount);
          const rating = readPopularimeterRating(
            isFrameUnsynchronised ? resynchronise(content) : content,
          );

          if (rating) return rating;
        }
      }

      offset += FRAME_HEADER_SIZE + size;
    }

    return null;
  } finally {
    await file.close();
  }
};

/**
 * The rating a player saved in an ID3 tag at the start of a file, such as an MP3's, as Medior's
 * rating. Unknown bytes, as players with their own scales write, read as the closest known one.
 * Null when the tag has none.
 */
export const readId3Rating = async (filePath: string) => {
  const byte = await readPopularimeterByte(filePath);
  if (!byte) return null;

  return POPM_RATINGS.reduce((closest, entry) =>
    Math.abs(entry[0] - byte) < Math.abs(closest[0] - byte) ? entry : closest,
  )[1];
};
