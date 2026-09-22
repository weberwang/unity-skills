import { deflateSync, inflateSync } from "node:zlib";

/** PNG 文件签名，用于拒绝非 PNG 输入。 */
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
/** 单张输入允许的最大边长，避免异常 IHDR 触发无界分配。 */
const MAX_PNG_DIMENSION = 16_384;
/** 单张输入允许的最大像素数，约束 RGBA 与解压缓冲区上限。 */
const MAX_PNG_PIXELS = 67_108_864;

/** 预计算 CRC 表，保证 PNG 编解码无需外部依赖。 */
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

/** 计算 PNG chunk 使用的 CRC-32。 */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 创建带长度与 CRC 的 PNG chunk。 */
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Paeth 过滤器预测值。 */
function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  return leftDistance <= upDistance && leftDistance <= upperLeftDistance ? left : upDistance <= upperLeftDistance ? up : upperLeft;
}

/** 解码 8 位非隔行 PNG，并统一输出 RGBA 像素。 */
export function decodePngRgba(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("输入必须是 PNG");
  let offset = 8;
  let header = null;
  const idat = [];
  let palette = null;
  let transparency = null;
  let sawHeader = false;
  let sawEnd = false;
  let sawImageData = false;
  let chunkCount = 0;

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new Error("PNG chunk 不完整");
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) throw new Error("PNG chunk 越界");
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error(`PNG chunk 类型无效：${type}`);
    if (chunkCount === 0 && type !== "IHDR") throw new Error("PNG 必须以 IHDR 开始");
    const data = bytes.subarray(dataStart, dataEnd);
    const expectedCrc = bytes.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type), data]));
    if (expectedCrc !== actualCrc) throw new Error(`PNG ${type} CRC 无效`);

    if (type === "IHDR") {
      if (sawHeader || length !== 13) throw new Error("PNG 必须只有一个合法 IHDR");
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
      sawHeader = true;
    } else if (!sawHeader) {
      throw new Error("PNG IHDR 顺序无效");
    }

    if (type === "IDAT") {
      if (length === 0 || sawEnd) throw new Error("PNG IDAT 顺序或长度无效");
      idat.push(data);
      sawImageData = true;
    } else if (type === "PLTE") {
      if (sawImageData || palette) throw new Error("PNG PLTE 必须唯一且位于 IDAT 前");
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      if (sawImageData || transparency) throw new Error("PNG tRNS 必须唯一且位于 IDAT 前");
      transparency = Buffer.from(data);
    } else if (type === "IEND") {
      if (sawEnd || length !== 0 || !sawImageData) throw new Error("PNG 必须在 IDAT 后只有一个空 IEND");
      sawEnd = true;
    }
    offset = dataEnd + 4;
    chunkCount += 1;
    if (sawEnd) break;
  }

  if (!header || !sawHeader || !sawImageData || !sawEnd || offset !== bytes.length || header.width <= 0 || header.height <= 0 || header.depth !== 8 || header.interlace !== 0 || header.compression !== 0 || header.filter !== 0) {
    throw new Error("PNG 必须是完整的 8 位非隔行图像");
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  if (!channels) throw new Error("PNG 色彩类型不受支持");
  if (header.colorType === 3 && (!palette || palette.length % 3 !== 0)) throw new Error("索引 PNG 缺少合法调色板");
  if (header.width > MAX_PNG_DIMENSION || header.height > MAX_PNG_DIMENSION || header.width * header.height > MAX_PNG_PIXELS) {
    throw new Error(`PNG 尺寸超过安全上限：${header.width}x${header.height}`);
  }

  const rowBytes = header.width * channels;
  const expectedLength = header.height * (rowBytes + 1);
  const decoded = inflateSync(Buffer.concat(idat), { maxOutputLength: expectedLength });
  if (decoded.length !== expectedLength) throw new Error("PNG 解压长度与尺寸不一致");
  const rows = Buffer.alloc(header.height * rowBytes);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = decoded[sourceOffset++];
    const rowStart = y * rowBytes;
    const previousStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = decoded[sourceOffset++];
      const left = x >= channels ? rows[rowStart + x - channels] : 0;
      const up = y > 0 ? rows[previousStart + x] : 0;
      const upperLeft = y > 0 && x >= channels ? rows[previousStart + x - channels] : 0;
      if (filter === 0) rows[rowStart + x] = raw;
      else if (filter === 1) rows[rowStart + x] = raw + left;
      else if (filter === 2) rows[rowStart + x] = raw + up;
      else if (filter === 3) rows[rowStart + x] = raw + Math.floor((left + up) / 2);
      else if (filter === 4) rows[rowStart + x] = raw + paeth(left, up, upperLeft);
      else throw new Error(`PNG filter 不受支持：${filter}`);
    }
  }

  if (header.colorType === 0 && transparency && transparency.length !== 2) throw new Error("grayscale PNG 的 tRNS 必须包含 2 个字节");
  if (header.colorType === 2 && transparency && transparency.length !== 6) throw new Error("truecolor PNG 的 tRNS 必须包含 6 个字节");
  const grayscaleTransparency = header.colorType === 0 && transparency ? transparency.readUInt16BE(0) : null;
  const truecolorTransparency = header.colorType === 2 && transparency
    ? [transparency.readUInt16BE(0), transparency.readUInt16BE(2), transparency.readUInt16BE(4)]
    : null;
  const pixels = Buffer.alloc(header.width * header.height * 4);
  for (let index = 0; index < header.width * header.height; index += 1) {
    const source = index * channels;
    const target = index * 4;
    if (header.colorType === 6) rows.copy(pixels, target, source, source + 4);
    else if (header.colorType === 2) {
      pixels[target] = rows[source];
      pixels[target + 1] = rows[source + 1];
      pixels[target + 2] = rows[source + 2];
      pixels[target + 3] = truecolorTransparency && rows[source] === truecolorTransparency[0] && rows[source + 1] === truecolorTransparency[1] && rows[source + 2] === truecolorTransparency[2] ? 0 : 255;
    } else if (header.colorType === 4) {
      pixels[target] = rows[source];
      pixels[target + 1] = rows[source];
      pixels[target + 2] = rows[source];
      pixels[target + 3] = rows[source + 1];
    } else if (header.colorType === 0) {
      const value = rows[source];
      pixels.fill(value, target, target + 3);
      pixels[target + 3] = grayscaleTransparency !== null && value === grayscaleTransparency ? 0 : 255;
    } else {
      const paletteIndex = rows[source];
      const paletteOffset = paletteIndex * 3;
      if (paletteOffset + 2 >= palette.length) throw new Error("PNG 调色板索引越界");
      pixels[target] = palette[paletteOffset];
      pixels[target + 1] = palette[paletteOffset + 1];
      pixels[target + 2] = palette[paletteOffset + 2];
      pixels[target + 3] = transparency?.[paletteIndex] ?? 255;
    }
  }
  return { width: header.width, height: header.height, pixels };
}

/** 编码稳定的 8 位 RGBA PNG，不改变输入尺寸。 */
export function encodePngRgba(width, height, pixels) {
  if (!(width > 0) || !(height > 0) || !Buffer.isBuffer(pixels) || pixels.length !== width * height * 4) throw new Error("RGBA 像素尺寸无效");
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
