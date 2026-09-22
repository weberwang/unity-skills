import assert from "node:assert/strict";
import { access, link, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import {
  BackgroundRemovalError,
  removeBackgroundLocal,
  removeConnectedBackground,
  runRemoveBackgroundCli,
} from "../../unity-game-visual-assets/scripts/remove-background-local.mjs";
import { decodePngRgba, encodePngRgba } from "../../unity-game-visual-assets/scripts/png-raster.mjs";

/** 创建填满指定 RGBA 颜色的测试图像。 */
function solidImage(width, height, color) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) {
    pixels.set(color, offset);
  }
  return { width, height, pixels };
}

/** 修改测试图像中的单个像素。 */
function setPixel(image, x, y, color) {
  image.pixels.set(color, (y * image.width + x) * 4);
}

/** 写出测试 PNG 并返回完整路径。 */
async function writeImage(root, name, image) {
  const path = join(root, name);
  await writeFile(path, encodePngRgba(image.width, image.height, image.pixels));
  return path;
}

/** 收集 CLI 输出，避免测试污染控制台。 */
function outputCollector() {
  const logs = [];
  const errors = [];
  return { logs, errors, log: (value) => logs.push(value), error: (value) => errors.push(value) };
}

/** 计算构造测试 PNG 所需的 CRC-32。 */
function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 创建带长度和 CRC 的测试 PNG chunk。 */
function testPngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 构造带 tRNS 透明键的 8 位非隔行 PNG。 */
function encodePngWithTransparency(width, height, channels, colorType, channelPixels, transparentColor) {
  const raw = Buffer.alloc(height * (width * channels + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * channels + 1)] = 0;
    channelPixels.copy(raw, y * (width * channels + 1) + 1, y * width * channels, (y + 1) * width * channels);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  const transparency = Buffer.alloc(transparentColor.length * 2);
  transparentColor.forEach((channel, index) => transparency.writeUInt16BE(channel, index * 2));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    testPngChunk("IHDR", header),
    testPngChunk("tRNS", transparency),
    testPngChunk("IDAT", deflateSync(raw)),
    testPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** 构造 IHDR 声明 1x1、实际解压数据远超扫描线长度的异常 PNG。 */
function oversizedInflatePng() {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    testPngChunk("IHDR", header),
    testPngChunk("IDAT", deflateSync(Buffer.alloc(1024 * 1024))),
    testPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

test("边缘连通算法只移除外部纯色并保留封闭同色区域", () => {
  const image = solidImage(5, 5, [10, 20, 30, 255]);
  for (let y = 1; y < 4; y += 1) for (let x = 1; x < 4; x += 1) setPixel(image, x, y, [230, 40, 50, 255]);
  setPixel(image, 2, 2, [10, 20, 30, 255]);

  const result = removeConnectedBackground(image, { backgroundColor: "#0a141e", tolerance: 0 });
  assert.equal(result.removedPixels, 16);
  assert.deepEqual([...result.pixels.subarray(0, 4)], [0, 0, 0, 0]);
  assert.deepEqual([...result.pixels.subarray((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)], [10, 20, 30, 255]);
});

test("透明边框可继续连通内部纯色背景但不重复计入删除", () => {
  const image = solidImage(5, 5, [0, 255, 0, 0]);
  for (let y = 1; y < 4; y += 1) for (let x = 1; x < 4; x += 1) setPixel(image, x, y, [0, 255, 0, 255]);
  setPixel(image, 2, 2, [240, 40, 50, 255]);
  const result = removeConnectedBackground(image, { backgroundColor: "#00ff00", tolerance: 0 });
  assert.equal(result.removedPixels, 8);
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[(1 * image.width + 1) * 4 + 3], 0);
  assert.equal(result.pixels[(2 * image.width + 2) * 4 + 3], 255);
});

test("RGB 与灰度 tRNS 输入解码为真实透明 Alpha", async () => {
  const rgbBytes = encodePngWithTransparency(2, 1, 3, 2, Buffer.from([12, 34, 56, 240, 40, 50]), [12, 34, 56]);
  const rgb = decodePngRgba(rgbBytes);
  assert.equal(rgb.pixels[3], 0);
  assert.equal(rgb.pixels[7], 255);

  const grayscale = decodePngRgba(encodePngWithTransparency(2, 1, 1, 0, Buffer.from([34, 240]), [34]));
  assert.equal(grayscale.pixels[3], 0);
  assert.equal(grayscale.pixels[7], 255);

  const root = await mkdtemp(join(tmpdir(), "unity-background-trns-"));
  try {
    const source = join(root, "source.png");
    await writeFile(source, rgbBytes);
    const record = await removeBackgroundLocal({ sourceFile: source, outputFile: join(root, "output.png"), reuseExistingAlpha: true });
    assert.equal(record.status, "PASS");
    assert.equal(record.source_has_alpha, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PNG 解码器拒绝超过 IHDR 扫描线长度的解压数据", () => {
  assert.throws(
    () => decodePngRgba(oversizedInflatePng()),
    (error) => error?.code === "ERR_BUFFER_TOO_LARGE" && /larger than 5 bytes/.test(error.message),
  );
});

test("严格纯色模式输出透明 PNG、记录和深浅底预览", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-background-removal-"));
  try {
    const image = solidImage(5, 5, [10, 20, 30, 255]);
    setPixel(image, 2, 2, [240, 240, 240, 255]);
    const source = await writeImage(root, "source.png", image);
    const output = join(root, "output.png");
    const recordFile = join(root, "record.json");
    const record = await removeBackgroundLocal({
      sourceFile: source,
      outputFile: output,
      recordFile,
      backgroundColor: "#0a141e",
      tolerance: 0,
      requireSolidBackground: true,
      preview: true,
    });

    assert.equal(record.status, "PASS");
    assert.equal(record.solid_background_check.status, "passed");
    assert.equal(record.removed_pixels, 24);
    assert.equal(record.foreground_pixels, 1);
    assert.match(record.output_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(decodePngRgba(await readFile(output)).pixels[3], 0);
    assert.equal(JSON.parse(await readFile(recordFile, "utf8")).schema, "background-removal-local/1");
    await access(record.preview_files.light);
    await access(record.preview_files.dark);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("严格模式拒绝透明或边缘颜色不一致的输入且不写出文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-background-reject-"));
  try {
    const image = solidImage(3, 3, [10, 20, 30, 255]);
    setPixel(image, 0, 0, [10, 20, 30, 0]);
    const source = await writeImage(root, "source.png", image);
    const output = join(root, "output.png");
    await assert.rejects(
      () => removeBackgroundLocal({ sourceFile: source, outputFile: output, backgroundColor: "#0a141e", tolerance: 0, requireSolidBackground: true }),
      (error) => error instanceof BackgroundRemovalError && /require_solid_background/.test(error.message),
    );
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("已有透明 Alpha 可显式复用但不会伪造背景移除记录", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-background-alpha-"));
  try {
    const image = solidImage(2, 2, [0, 0, 0, 0]);
    setPixel(image, 1, 1, [240, 40, 50, 255]);
    const source = await writeImage(root, "source.png", image);
    const record = await removeBackgroundLocal({ sourceFile: source, outputFile: join(root, "output.png"), reuseExistingAlpha: true });
    assert.equal(record.status, "PASS");
    assert.equal(record.operation, "direct-alpha");
    assert.equal(record.background_removal_attempt, undefined);
    assert.equal(record.removed_pixels, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("全背景或颜色不匹配会返回可审计的失败记录", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-background-failure-"));
  try {
    const source = await writeImage(root, "source.png", solidImage(3, 3, [10, 20, 30, 255]));
    const empty = await removeBackgroundLocal({ sourceFile: source, outputFile: join(root, "empty.png"), backgroundColor: "#0a141e", tolerance: 0 });
    assert.equal(empty.status, "FAIL");
    assert.deepEqual(empty.failures, ["empty-foreground"]);

    const mismatch = await removeBackgroundLocal({ sourceFile: source, outputFile: join(root, "mismatch.png"), backgroundColor: "#ffffff", tolerance: 0 });
    assert.equal(mismatch.status, "FAIL");
    assert.deepEqual(mismatch.failures, ["zero-deletion"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI 提供帮助并以退出码区分成功与失败", async () => {
  const help = outputCollector();
  assert.equal(await runRemoveBackgroundCli(["--help"], help), 0);
  assert.match(help.logs[0], /--require-solid-background/);

  const root = await mkdtemp(join(tmpdir(), "unity-background-cli-"));
  try {
    const image = solidImage(3, 3, [10, 20, 30, 255]);
    setPixel(image, 1, 1, [240, 240, 240, 255]);
    const source = await writeImage(root, "source.png", image);
    const output = outputCollector();
    const code = await runRemoveBackgroundCli([
      "--source", source,
      "--output", join(root, "output.png"),
      "--background-color", "#0a141e",
      "--tolerance", "0",
      "--require-solid-background",
    ], output);
    assert.equal(code, 0);
    assert.equal(output.errors.length, 0);
    assert.equal(JSON.parse(output.logs[0]).status, "PASS");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("参数和路径门禁拒绝非法容差、原地覆盖及预览冲突", async () => {
  const image = solidImage(2, 2, [10, 20, 30, 255]);
  assert.throws(() => removeConnectedBackground(image, { tolerance: 0 }), /background_color/);
  assert.throws(() => removeConnectedBackground(image, { backgroundColor: "#0a141e", tolerance: -1 }), /tolerance/);

  const root = await mkdtemp(join(tmpdir(), "unity-background-paths-"));
  try {
    const source = await writeImage(root, "source.light.png", image);
    await assert.rejects(() => removeBackgroundLocal({ sourceFile: source, outputFile: source, backgroundColor: "#0a141e", tolerance: 0 }), /不得是同一路径/);
    const output = join(root, "source.png");
    await assert.rejects(() => removeBackgroundLocal({ sourceFile: source, outputFile: output, backgroundColor: "#0a141e", tolerance: 0, previewDirectory: root }), /预览文件不得覆盖/);
    await assert.rejects(access(output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("排他写入拒绝通过硬链接别名覆盖源图", async () => {
  const root = await mkdtemp(join(tmpdir(), "unity-background-hardlink-"));
  try {
    const image = solidImage(3, 3, [10, 20, 30, 255]);
    setPixel(image, 1, 1, [240, 240, 240, 255]);
    const source = await writeImage(root, "source.png", image);
    const sourceBefore = await readFile(source);
    const output = join(root, "output.png");
    await link(source, output);
    await assert.rejects(
      () => removeBackgroundLocal({ sourceFile: source, outputFile: output, backgroundColor: "#0a141e", tolerance: 0 }),
      /写入目标已存在，拒绝覆盖/,
    );
    assert.deepEqual(await readFile(source), sourceBefore);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
