// ==============================================================================
// Pure JavaScript Binary ZIP (PK\x03\x04) Archive Generator
// Generates standard ZIP archives directly in-browser without external libraries
// Guaranteed binary format: immune to HTML redirects, iframe sandboxes, and proxy errors
// ==============================================================================

export interface ZipFileInput {
  path: string;
  content: string;
}

/**
 * Standard CRC32 checksum calculator
 */
function crc32(buf: Uint8Array): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Writes a 32-bit unsigned integer in little-endian order
 */
function writeUInt32LE(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

/**
 * Writes a 16-bit unsigned integer in little-endian order
 */
function writeUInt16LE(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

/**
 * Encodes string to UTF-8 Uint8Array
 */
const encoder = new TextEncoder();

/**
 * Builds a valid binary PKZip archive from a list of files
 */
export function buildZipArchive(files: ZipFileInput[]): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = encoder.encode(f.path);
    const dataBytes = encoder.encode(f.content);
    const checksum = crc32(dataBytes);
    const size = dataBytes.length;

    // 1. Local File Header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);

    writeUInt32LE(localView, 0, 0x04034b50); // Local file header signature 'PK\x03\x04'
    writeUInt16LE(localView, 4, 20);         // Version needed to extract (2.0)
    writeUInt16LE(localView, 6, 0);          // General purpose bit flag
    writeUInt16LE(localView, 8, 0);          // Compression method (0 = Stored / uncompressed)
    writeUInt16LE(localView, 10, 0x5800);    // File last mod time
    writeUInt16LE(localView, 12, 0x5461);    // File last mod date
    writeUInt32LE(localView, 14, checksum);  // CRC-32
    writeUInt32LE(localView, 18, size);      // Compressed size
    writeUInt32LE(localView, 22, size);      // Uncompressed size
    writeUInt16LE(localView, 26, nameBytes.length); // Filename length
    writeUInt16LE(localView, 28, 0);         // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    // 2. Central Directory Header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);

    writeUInt32LE(centralView, 0, 0x02014b50); // Central directory signature 'PK\x01\x02'
    writeUInt16LE(centralView, 4, 20);         // Version made by
    writeUInt16LE(centralView, 6, 20);         // Version needed to extract
    writeUInt16LE(centralView, 8, 0);          // General purpose bit flag
    writeUInt16LE(centralView, 10, 0);         // Compression method
    writeUInt16LE(centralView, 12, 0x5800);    // File last mod time
    writeUInt16LE(centralView, 14, 0x5461);    // File last mod date
    writeUInt32LE(centralView, 16, checksum);  // CRC-32
    writeUInt32LE(centralView, 20, size);      // Compressed size
    writeUInt32LE(centralView, 24, size);      // Uncompressed size
    writeUInt16LE(centralView, 28, nameBytes.length); // Filename length
    writeUInt16LE(centralView, 30, 0);         // Extra field length
    writeUInt16LE(centralView, 32, 0);         // File comment length
    writeUInt16LE(centralView, 34, 0);         // Disk number start
    writeUInt16LE(centralView, 36, 0);         // Internal file attributes
    writeUInt32LE(centralView, 38, 0);         // External file attributes
    writeUInt32LE(centralView, 42, offset);    // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralChunks.reduce((acc, chunk) => acc + chunk.length, 0);

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);

  writeUInt32LE(eocdView, 0, 0x06054b50);    // EOCD signature 'PK\x05\x06'
  writeUInt16LE(eocdView, 4, 0);             // Number of this disk
  writeUInt16LE(eocdView, 6, 0);             // Disk where central directory starts
  writeUInt16LE(eocdView, 8, files.length);  // Number of records on this disk
  writeUInt16LE(eocdView, 10, files.length); // Total number of records
  writeUInt32LE(eocdView, 12, centralDirSize);    // Size of central directory
  writeUInt32LE(eocdView, 16, centralDirOffset);  // Offset of central directory
  writeUInt16LE(eocdView, 20, 0);            // Comment length

  // Combine all parts
  const totalLength = offset + centralDirSize + eocd.length;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const chunk of localChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  result.set(eocd, pos);

  return result;
}

/**
 * Downloads a binary Uint8Array as a file with guaranteed application/zip MIME
 */
export function triggerBinaryZipDownload(zipBytes: Uint8Array, filename = 'flash-arb.zip'): void {
  // Verify magic bytes PK\x03\x04
  if (zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4B || zipBytes[2] !== 0x03 || zipBytes[3] !== 0x04) {
    console.error('Invalid ZIP header bytes:', zipBytes.slice(0, 4));
    throw new Error('Corrupted or invalid ZIP magic bytes');
  }

  const blob = new Blob([zipBytes.buffer as ArrayBuffer], { type: 'application/zip' });
  const blobUrl = window.URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // Ignore cleanup error
    }
  }, 1000);
}
