// webp_browser_enc.js —— 浏览器兼容版
(function (global) {
  'use strict';

  // 自动推断 .wasm 文件路径（同目录）
  const scriptSrc = document.currentScript?.src || '';
  const wasmUrl = scriptSrc.replace(/\.js$/, '.wasm');

  let wasmModule = null;

  function getImports() {
    return {
      env: {
        memory: new WebAssembly.Memory({ initial: 256, maximum: 65536 }),
        __memory_base: 0,
        __table_base: 0,
        abort: () => { throw new Error('WASM abort'); },
        // 可根据实际需要补充其他 imports
      }
    };
  }

  async function initWasm() {
    if (wasmModule) return wasmModule;

    try {
      const response = await fetch(wasmUrl);
      if (!response.ok) throw new Error(`Failed to load WASM: ${wasmUrl}`);
      const bytes = await response.arrayBuffer();
      const { instance } = await WebAssembly.instantiate(bytes, getImports());
      wasmModule = instance;
      return instance;
    } catch (err) {
      console.error('[WebP] Failed to initialize WebAssembly:', err);
      throw err;
    }
  }

  async function encode(imageData, options = {}) {
    const { width, height, data: rgba } = imageData;
    const quality = options.quality ?? 80;
    const lossless = options.lossless ?? false;
    const alphaQuality = options.alphaQuality ?? 100;

    const instance = await initWasm();
    const { exports } = instance;

    // 检查是否导出了 encode 函数（实际函数名可能不同）
    if (typeof exports._encode !== 'function') {
      throw new Error('WASM module does not export _encode function');
    }

    // 分配内存
    const size = width * height * 4;
    const ptr = exports.malloc(size);
    const memory = new Uint8Array(exports.memory.buffer, ptr, size);
    memory.set(rgba);

    // 调用 WASM encode
    const resultPtr = exports._encode(ptr, width, height, quality, lossless ? 1 : 0, alphaQuality);

    // 读取结果长度
    const resultSize = new Uint32Array(exports.memory.buffer, resultPtr, 1)[0];
    const resultData = new Uint8Array(exports.memory.buffer, resultPtr + 4, resultSize);

    // 复制结果（避免内存被释放后失效）
    const output = new Uint8Array(resultSize);
    output.set(resultData);

    // 释放内存（如果 WASM 提供了 free）
    if (typeof exports.free === 'function') {
      exports.free(resultPtr);
      exports.free(ptr);
    }

    return output;
  }

  // 导出到全局
  global.WebP = {
    encode: encode
  };

  // 可选：自动初始化（懒加载）
  // WebP.encode 会在首次调用时加载 WASM

})(typeof window !== 'undefined' ? window : globalThis);