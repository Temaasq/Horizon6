'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createMock2DContext(canvas) {
  const noop = () => {};
  const grad = () => ({ addColorStop: noop });
  return {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '12px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: noop,
    restore: noop,
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (txt) => ({ width: String(txt || '').length * 7 }),
    createLinearGradient: grad,
    createRadialGradient: grad,
    createPattern: () => ({}),
    drawImage: noop,
    setLineDash: noop,
    getLineDash: () => [],
    getImageData: (x, y, w, h) => ({
      width: w || 1,
      height: h || 1,
      data: new Uint8ClampedArray((w || 1) * (h || 1) * 4),
    }),
    putImageData: noop,
    createImageData: (w, h) => ({
      width: w || 1,
      height: h || 1,
      data: new Uint8ClampedArray((w || 1) * (h || 1) * 4),
    }),
  };
}

function createMockWebGLContext(canvas) {
  const noop = () => {};
  const gl = {
    canvas,
    drawingBufferWidth: canvas.width || 1280,
    drawingBufferHeight: canvas.height || 720,
    // Constants used by Three.js r128-r160
    ZERO: 0,
    ONE: 1,
    TRUE: 1,
    FALSE: 0,
    NO_ERROR: 0,
    POINTS: 0,
    LINES: 1,
    LINE_LOOP: 2,
    LINE_STRIP: 3,
    TRIANGLES: 4,
    TRIANGLE_STRIP: 5,
    TRIANGLE_FAN: 6,
    DEPTH_BUFFER_BIT: 256,
    STENCIL_BUFFER_BIT: 1024,
    COLOR_BUFFER_BIT: 16384,
    FRONT: 1028,
    BACK: 1029,
    FRONT_AND_BACK: 1032,
    NEVER: 512,
    LESS: 513,
    EQUAL: 514,
    LEQUAL: 515,
    GREATER: 516,
    NOTEQUAL: 517,
    GEQUAL: 518,
    ALWAYS: 519,
    SRC_COLOR: 768,
    ONE_MINUS_SRC_COLOR: 769,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    DST_ALPHA: 772,
    ONE_MINUS_DST_ALPHA: 773,
    DST_COLOR: 774,
    ONE_MINUS_DST_COLOR: 775,
    FUNC_ADD: 32774,
    FUNC_SUBTRACT: 32778,
    FUNC_REVERSE_SUBTRACT: 32779,
    CW: 2304,
    CCW: 2305,
    CULL_FACE: 2884,
    BLEND: 3042,
    DITHER: 3024,
    STENCIL_TEST: 2960,
    DEPTH_TEST: 2929,
    SCISSOR_TEST: 3089,
    POLYGON_OFFSET_FILL: 32823,
    SAMPLE_ALPHA_TO_COVERAGE: 32926,
    SAMPLE_COVERAGE: 32928,
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    INT: 5124,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
    HALF_FLOAT: 5131,
    ARRAY_BUFFER: 34962,
    ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044,
    DYNAMIC_DRAW: 35048,
    STREAM_DRAW: 35040,
    TEXTURE_2D: 3553,
    TEXTURE_CUBE_MAP: 34067,
    TEXTURE_3D: 32879,
    TEXTURE_2D_ARRAY: 35866,
    TEXTURE0: 33984,
    RGB: 6407,
    RGBA: 6408,
    ALPHA: 6406,
    LUMINANCE: 6409,
    LUMINANCE_ALPHA: 6410,
    RED: 6403,
    RG: 33319,
    RGBA8: 32856,
    RGBA16F: 34842,
    RGBA32F: 34836,
    DEPTH_COMPONENT: 6402,
    DEPTH_STENCIL: 34041,
    NEAREST: 9728,
    LINEAR: 9729,
    NEAREST_MIPMAP_NEAREST: 9984,
    LINEAR_MIPMAP_NEAREST: 9985,
    NEAREST_MIPMAP_LINEAR: 9986,
    LINEAR_MIPMAP_LINEAR: 9987,
    TEXTURE_MAG_FILTER: 10240,
    TEXTURE_MIN_FILTER: 10241,
    TEXTURE_WRAP_S: 10242,
    TEXTURE_WRAP_T: 10243,
    TEXTURE_WRAP_R: 32882,
    REPEAT: 10497,
    CLAMP_TO_EDGE: 33071,
    MIRRORED_REPEAT: 33648,
    UNPACK_ALIGNMENT: 3317,
    PACK_ALIGNMENT: 3333,
    UNPACK_FLIP_Y_WEBGL: 37440,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 37443,
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713,
    LINK_STATUS: 35714,
    VALIDATE_STATUS: 35715,
    ACTIVE_UNIFORMS: 35718,
    ACTIVE_ATTRIBUTES: 35721,
    VENDOR: 7936,
    RENDERER: 7937,
    VERSION: 7938,
    SHADING_LANGUAGE_VERSION: 35724,
    MAX_TEXTURE_SIZE: 3379,
    MAX_CUBE_MAP_TEXTURE_SIZE: 34076,
    MAX_RENDERBUFFER_SIZE: 34024,
    MAX_VIEWPORT_DIMS: 3386,
    MAX_VERTEX_ATTRIBS: 34921,
    MAX_VERTEX_UNIFORM_VECTORS: 36347,
    MAX_FRAGMENT_UNIFORM_VECTORS: 36349,
    MAX_VARYING_VECTORS: 36348,
    MAX_TEXTURE_IMAGE_UNITS: 34930,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 35660,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 35661,
    MAX_SAMPLES: 36183,
    SAMPLES: 32937,
    HIGH_FLOAT: 36338,
    MEDIUM_FLOAT: 36337,
    LOW_FLOAT: 36336,
    HIGH_INT: 36341,
    MEDIUM_INT: 36340,
    LOW_INT: 36339,
    FRAMEBUFFER: 36160,
    READ_FRAMEBUFFER: 36008,
    DRAW_FRAMEBUFFER: 36009,
    RENDERBUFFER: 36161,
    FRAMEBUFFER_COMPLETE: 36053,
    COLOR_ATTACHMENT0: 36064,
    DEPTH_ATTACHMENT: 36096,
    STENCIL_ATTACHMENT: 36128,
    DEPTH_STENCIL_ATTACHMENT: 33306,
    DEPTH_COMPONENT16: 33189,
    DEPTH_COMPONENT24: 33190,
    SRGB8_ALPHA8: 35907,
    TEXTURE_MAX_ANISOTROPY_EXT: 34046,
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047,

    getContextAttributes: () => ({
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    }),
    isContextLost: () => false,
    getSupportedExtensions: () => [
      'EXT_texture_filter_anisotropic',
      'OES_texture_float',
      'OES_texture_half_float',
      'OES_element_index_uint',
      'OES_vertex_array_object',
      'WEBGL_depth_texture',
      'WEBGL_lose_context',
    ],
    getExtension: (name) => {
      if (name === 'EXT_texture_filter_anisotropic') {
        return {
          TEXTURE_MAX_ANISOTROPY_EXT: 34046,
          MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047,
        };
      }
      if (name === 'OES_vertex_array_object') {
        return {
          createVertexArrayOES: () => ({}),
          bindVertexArrayOES: noop,
          deleteVertexArrayOES: noop,
        };
      }
      if (name === 'ANGLE_instanced_arrays') {
        return {
          drawArraysInstancedANGLE: noop,
          drawElementsInstancedANGLE: noop,
          vertexAttribDivisorANGLE: noop,
        };
      }
      if (name === 'WEBGL_lose_context') {
        return { loseContext: noop, restoreContext: noop };
      }
      return {};
    },
    getParameter: (param) => {
      switch (param) {
        case 7938: // VERSION
          return 'WebGL 2.0 (Mock)';
        case 35724: // SHADING_LANGUAGE_VERSION
          return 'WebGL GLSL ES 3.00';
        case 7936: // VENDOR
          return 'Horizon6 Mock';
        case 7937: // RENDERER
          return 'Horizon6 WebGL2 Mock';
        case 3379: // MAX_TEXTURE_SIZE
        case 34076:
        case 34024:
          return 4096;
        case 3386: // MAX_VIEWPORT_DIMS
          return new Int32Array([4096, 4096]);
        case 34921: // MAX_VERTEX_ATTRIBS
        case 34930: // MAX_TEXTURE_IMAGE_UNITS
        case 35660: // MAX_VERTEX_TEXTURE_IMAGE_UNITS
        case 35661: // MAX_COMBINED_TEXTURE_IMAGE_UNITS
          return 16;
        case 36347: // MAX_VERTEX_UNIFORM_VECTORS
        case 36349: // MAX_FRAGMENT_UNIFORM_VECTORS
          return 1024;
        case 36348: // MAX_VARYING_VECTORS
          return 30;
        case 36183: // MAX_SAMPLES
          return 4;
        case 32937: // SAMPLES
          return 0;
        case 34047: // MAX_TEXTURE_MAX_ANISOTROPY_EXT
          return 16;
        default:
          return 0;
      }
    },
    getShaderPrecisionFormat: () => ({
      rangeMin: 127,
      rangeMax: 127,
      precision: 23,
    }),
    getError: () => 0,
    createShader: () => ({}),
    shaderSource: noop,
    compileShader: noop,
    getShaderParameter: (_s, pname) => (pname === 35713 ? true : 0),
    getShaderInfoLog: () => '',
    deleteShader: noop,
    createProgram: () => ({}),
    attachShader: noop,
    linkProgram: noop,
    validateProgram: noop,
    getProgramParameter: (_p, pname) => (pname === 35714 || pname === 35715 ? true : 0),
    getProgramInfoLog: () => '',
    useProgram: noop,
    deleteProgram: noop,
    getUniformLocation: (_p, name) => ({ name }),
    getAttribLocation: () => 0,
    getActiveUniform: () => ({ name: 'u_mock', type: 5126, size: 1 }),
    getActiveAttrib: () => ({ name: 'a_mock', type: 5126, size: 1 }),
    getUniformBlockIndex: () => 0,
    uniformBlockBinding: noop,
    createBuffer: () => ({}),
    bindBuffer: noop,
    bindBufferBase: noop,
    bufferData: noop,
    bufferSubData: noop,
    deleteBuffer: noop,
    createTexture: () => ({}),
    bindTexture: noop,
    activeTexture: noop,
    texImage2D: noop,
    texSubImage2D: noop,
    texImage3D: noop,
    texStorage2D: noop,
    texStorage3D: noop,
    texParameteri: noop,
    texParameterf: noop,
    generateMipmap: noop,
    pixelStorei: noop,
    deleteTexture: noop,
    createFramebuffer: () => ({}),
    bindFramebuffer: noop,
    framebufferTexture2D: noop,
    framebufferRenderbuffer: noop,
    checkFramebufferStatus: () => 36053,
    deleteFramebuffer: noop,
    blitFramebuffer: noop,
    readBuffer: noop,
    drawBuffers: noop,
    createRenderbuffer: () => ({}),
    bindRenderbuffer: noop,
    renderbufferStorage: noop,
    renderbufferStorageMultisample: noop,
    deleteRenderbuffer: noop,
    createVertexArray: () => ({}),
    bindVertexArray: noop,
    deleteVertexArray: noop,
    enableVertexAttribArray: noop,
    disableVertexAttribArray: noop,
    vertexAttribPointer: noop,
    vertexAttribIPointer: noop,
    vertexAttribDivisor: noop,
    uniform1i: noop,
    uniform1f: noop,
    uniform2f: noop,
    uniform3f: noop,
    uniform4f: noop,
    uniform1iv: noop,
    uniform1fv: noop,
    uniform2fv: noop,
    uniform3fv: noop,
    uniform4fv: noop,
    uniformMatrix2fv: noop,
    uniformMatrix3fv: noop,
    uniformMatrix4fv: noop,
    enable: noop,
    disable: noop,
    depthFunc: noop,
    depthMask: noop,
    depthRange: noop,
    colorMask: noop,
    stencilMask: noop,
    stencilFunc: noop,
    stencilOp: noop,
    blendFunc: noop,
    blendFuncSeparate: noop,
    blendEquation: noop,
    blendEquationSeparate: noop,
    blendColor: noop,
    cullFace: noop,
    frontFace: noop,
    lineWidth: noop,
    polygonOffset: noop,
    viewport: noop,
    scissor: noop,
    clearColor: noop,
    clearDepth: noop,
    clearStencil: noop,
    clear: noop,
    drawArrays: noop,
    drawElements: noop,
    drawArraysInstanced: noop,
    drawElementsInstanced: noop,
    finish: noop,
    flush: noop,
    readPixels: noop,
  };
  return gl;
}

class MockClassList {
  constructor(el) {
    this._el = el;
    this._set = new Set();
  }
  _syncFromAttr(str) {
    this._set = new Set(String(str || '').split(/\s+/).filter(Boolean));
  }
  _syncToAttr() {
    this._el._attrs.class = Array.from(this._set).join(' ');
  }
  add(...tokens) {
    for (const t of tokens) if (t) this._set.add(t);
    this._syncToAttr();
  }
  remove(...tokens) {
    for (const t of tokens) this._set.delete(t);
    this._syncToAttr();
  }
  toggle(token, force) {
    if (force === undefined) {
      if (this._set.has(token)) {
        this._set.delete(token);
        this._syncToAttr();
        return false;
      }
      this._set.add(token);
      this._syncToAttr();
      return true;
    }
    if (force) this._set.add(token);
    else this._set.delete(token);
    this._syncToAttr();
    return Boolean(force);
  }
  contains(token) {
    return this._set.has(token);
  }
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.nodeName = this.tagName;
    this.nodeType = 1;
    this.ownerDocument = ownerDocument;
    this._attrs = {};
    this.classList = new MockClassList(this);
    this.style = {
      _props: {},
      setProperty: (k, v) => {
        this.style[k] = v;
      },
      getPropertyValue: (k) => this.style[k] || '',
      removeProperty: (k) => {
        delete this.style[k];
      },
    };
    this.dataset = {};
    this.children = [];
    this.parentNode = null;
    this._listeners = new Map();
    this._text = '';
    this._rect = null;
    this.clientWidth = 1280;
    this.clientHeight = 720;
    this.offsetWidth = 1280;
    this.offsetHeight = 720;
    this.disabled = false;
    this.value = '';
    this.checked = false;
  }

  get id() {
    return this._attrs.id || '';
  }
  set id(v) {
    this._attrs.id = String(v);
    if (this.ownerDocument && v) {
      this.ownerDocument._byId.set(String(v), this);
    }
  }

  get className() {
    return this._attrs.class || '';
  }
  set className(v) {
    this.classList._syncFromAttr(v);
    this._attrs.class = String(v || '');
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this._text + this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this._text = String(v ?? '');
    this.children = [];
  }

  get innerText() {
    return this.textContent;
  }
  set innerText(v) {
    this.textContent = v;
  }

  get innerHTML() {
    return this._innerHTML !== undefined ? this._innerHTML : this.textContent;
  }
  set innerHTML(v) {
    this._innerHTML = String(v ?? '');
    this._text = this._innerHTML.replace(/<[^>]+>/g, ' ').trim();
    this.children = [];
    // Parse simple nested elements created dynamically (e.g. garage cards)
    if (this._innerHTML.includes('<') && this.ownerDocument) {
      parseHtmlFragmentInto(this._innerHTML, this, this.ownerDocument);
    }
  }

  setAttribute(name, val) {
    const k = String(name);
    const s = String(val);
    this._attrs[k] = s;
    if (k === 'id') {
      this.id = s;
    } else if (k === 'class') {
      this.classList._syncFromAttr(s);
    } else if (k.startsWith('data-')) {
      const camel = k
        .slice(5)
        .replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      this.dataset[camel] = s;
    }
  }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name)
      ? this._attrs[name]
      : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name);
  }
  removeAttribute(name) {
    delete this._attrs[name];
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    if (this.ownerDocument && child.id) {
      this.ownerDocument._byId.set(child.id, child);
    }
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
  contains(node) {
    if (node === this) return true;
    return this.children.some((c) => c.contains(node));
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    if (this._listeners.has(type)) this._listeners.get(type).delete(fn);
  }
  dispatchEvent(evt) {
    if (!evt || !evt.type) return true;
    if (!evt.target) evt.target = this;
    evt.currentTarget = this;
    const set = this._listeners.get(evt.type);
    if (set) {
      for (const fn of Array.from(set)) {
        fn.call(this, evt);
      }
    }
    if (evt.bubbles !== false && this.parentNode && !evt._stopped) {
      this.parentNode.dispatchEvent(evt);
    }
    return !evt.defaultPrevented;
  }
  click() {
    this.dispatchEvent({
      type: 'click',
      bubbles: true,
      preventDefault() {},
      stopPropagation() {
        this._stopped = true;
      },
    });
  }

  setPointerCapture() {}
  releasePointerCapture() {}
  focus() {}
  blur() {}

  getBoundingClientRect() {
    if (this._rect) return { ...this._rect };
    const id = (this.id || '').toLowerCase();
    if (id.includes('wheel') || this.className.toLowerCase().includes('wheel')) {
      return { left: 24, top: 530, right: 180, bottom: 686, width: 156, height: 156, x: 24, y: 530 };
    }
    if (this.tagName === 'CANVAS') {
      return { left: 0, top: 0, right: this.width || 1280, bottom: this.height || 720, width: this.width || 1280, height: this.height || 720, x: 0, y: 0 };
    }
    return { left: 100, top: 100, right: 200, bottom: 180, width: 100, height: 80, x: 100, y: 100 };
  }

  matches(selector) {
    return matchSelector(this, selector);
  }
  closest(selector) {
    let cur = this;
    while (cur && cur.nodeType === 1) {
      if (matchSelector(cur, selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector) {
    const out = [];
    const parts = String(selector).split(',').map((s) => s.trim()).filter(Boolean);
    const visit = (node) => {
      for (const ch of node.children) {
        if (parts.some((p) => matchSelector(ch, p))) out.push(ch);
        visit(ch);
      }
    };
    visit(this);
    return out;
  }
  getElementsByTagName(tag) {
    const t = String(tag).toUpperCase();
    const out = [];
    const visit = (node) => {
      for (const ch of node.children) {
        if (t === '*' || ch.tagName === t) out.push(ch);
        visit(ch);
      }
    };
    visit(this);
    return out;
  }
  getElementsByClassName(cls) {
    const out = [];
    const visit = (node) => {
      for (const ch of node.children) {
        if (ch.classList.contains(cls)) out.push(ch);
        visit(ch);
      }
    };
    visit(this);
    return out;
  }
}

class MockCanvas extends MockElement {
  constructor(ownerDocument) {
    super('canvas', ownerDocument);
    this.width = 1280;
    this.height = 720;
    this._ctx2d = null;
    this._ctxGl = null;
  }
  getContext(kind) {
    const k = String(kind || '').toLowerCase();
    if (k === '2d') {
      if (!this._ctx2d) this._ctx2d = createMock2DContext(this);
      return this._ctx2d;
    }
    if (k === 'webgl2' || k === 'webgl' || k === 'experimental-webgl') {
      if (!this._ctxGl) this._ctxGl = createMockWebGLContext(this);
      return this._ctxGl;
    }
    return null;
  }
  toDataURL() {
    return 'data:image/png;base64,';
  }
}

function matchSingleCompound(el, sel) {
  let s = sel.trim();
  if (!s) return false;
  // Support basic #id, .class, tag, [attr], [attr="val"]
  const tagMatch = s.match(/^([a-zA-Z0-9_-]+)/);
  if (tagMatch && !s.startsWith('#') && !s.startsWith('.') && !s.startsWith('[')) {
    if (el.tagName !== tagMatch[1].toUpperCase()) return false;
    s = s.slice(tagMatch[1].length);
  }
  const idMatches = s.match(/#([a-zA-Z0-9_-]+)/g);
  if (idMatches) {
    for (const m of idMatches) {
      if (el.id !== m.slice(1)) return false;
    }
  }
  const clsMatches = s.match(/\.([a-zA-Z0-9_-]+)/g);
  if (clsMatches) {
    for (const m of clsMatches) {
      if (!el.classList.contains(m.slice(1))) return false;
    }
  }
  const attrMatches = s.match(/\[([^\]]+)\]/g);
  if (attrMatches) {
    for (const m of attrMatches) {
      const inner = m.slice(1, -1).trim();
      const opMatch = inner.match(/^([a-zA-Z0-9_:-]+)\s*([*^$~|]?=)\s*(.+)$/);
      if (!opMatch) {
        if (!el.hasAttribute(inner)) return false;
      } else {
        const k = opMatch[1];
        const op = opMatch[2];
        const v = opMatch[3].trim().replace(/^['"]|['"]$/g, '');
        const actual = el.getAttribute(k);
        if (actual === null) return false;
        if (op === '=') {
          if (actual !== v) return false;
        } else if (op === '*=') {
          if (!v || !actual.includes(v)) return false;
        } else if (op === '^=') {
          if (!v || !actual.startsWith(v)) return false;
        } else if (op === '$=') {
          if (!v || !actual.endsWith(v)) return false;
        } else if (op === '~=') {
          if (!v || !actual.split(/\s+/).includes(v)) return false;
        } else if (op === '|=') {
          if (actual !== v && !actual.startsWith(v + '-')) return false;
        }
      }
    }
  }
  return Boolean(tagMatch || idMatches || clsMatches || attrMatches);
}

function matchSelector(el, selector) {
  const tokens = String(selector).trim().split(/\s+/).filter((t) => t !== '>');
  if (tokens.length === 0) return false;
  if (!matchSingleCompound(el, tokens[tokens.length - 1])) return false;
  let cur = el.parentNode;
  for (let i = tokens.length - 2; i >= 0; i--) {
    while (cur && cur.nodeType === 1 && !matchSingleCompound(cur, tokens[i])) {
      cur = cur.parentNode;
    }
    if (!cur || cur.nodeType !== 1) return false;
    cur = cur.parentNode;
  }
  return true;
}

const VOID_TAGS = new Set([
  'meta',
  'link',
  'img',
  'input',
  'br',
  'hr',
  'source',
  'path',
  'circle',
  'rect',
  'line',
  'polygon',
  'polyline',
]);

function parseAttributes(attrStr, el) {
  const re = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    const name = m[1];
    const val = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
    el.setAttribute(name, val);
  }
}

function parseHtmlFragmentInto(html, rootEl, doc) {
  const cleaned = String(html).replace(/<!--[\s\S]*?-->/g, '');
  const stack = [rootEl];
  const tokenRe = /<\/?([a-zA-Z0-9_-]+)([^>]*)>|([^<]+)/g;
  let m;
  while ((m = tokenRe.exec(cleaned)) !== null) {
    const top = stack[stack.length - 1];
    if (m[3] !== undefined) {
      const txt = m[3].replace(/\s+/g, ' ');
      if (txt.trim()) {
        top._text += (top._text ? ' ' : '') + txt.trim();
      }
      continue;
    }
    const raw = m[0];
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    if (raw.startsWith('</')) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tag) {
          stack.length = i;
          break;
        }
      }
    } else {
      const el = tag === 'canvas' ? new MockCanvas(doc) : new MockElement(tag, doc);
      parseAttributes(attrs, el);
      top.appendChild(el);
      const selfClosing = raw.endsWith('/>') || VOID_TAGS.has(tag);
      if (!selfClosing && tag !== 'script' && tag !== 'style') {
        stack.push(el);
      }
    }
  }
}

function parseIndexHtml(htmlPath) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptTags = [];
  const scriptRe = /<script\b([^>]*)>/gi;
  let m;
  while ((m = scriptRe.exec(html)) !== null) {
    const attrs = m[1];
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    scriptTags.push({
      src: srcMatch ? srcMatch[1] : null,
      type: typeMatch ? typeMatch[1] : null,
      defer: /\bdefer\b/i.test(attrs),
      raw: m[0],
    });
  }
  return { html, scriptTags };
}

class MockStorage {
  constructor({ initial = {}, corruptKeys = [], throwOnAccess = false } = {}) {
    this._map = new Map(Object.entries(initial));
    for (const k of corruptKeys) {
      this._map.set(k, '{invalid-json-corrupt');
    }
    this._throwOnAccess = throwOnAccess;
  }
  getItem(k) {
    if (this._throwOnAccess) throw new Error('SecurityError: storage disabled');
    return this._map.has(k) ? this._map.get(k) : null;
  }
  setItem(k, v) {
    if (this._throwOnAccess) throw new Error('QuotaExceededError: storage disabled');
    this._map.set(String(k), String(v));
  }
  removeItem(k) {
    if (this._throwOnAccess) throw new Error('SecurityError');
    this._map.delete(String(k));
  }
  clear() {
    if (this._throwOnAccess) throw new Error('SecurityError');
    this._map.clear();
  }
}

function createMockAudioContextClass() {
  return class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 44100;
      this.currentTime = 0;
      this.destination = { maxChannelCount: 2 };
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
    close() {
      this.state = 'closed';
      return Promise.resolve();
    }
    _param(val = 0) {
      return {
        value: val,
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
        cancelScheduledValues: () => {},
      };
    }
    createGain() {
      return {
        gain: this._param(1),
        connect: () => {},
        disconnect: () => {},
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: this._param(440),
        detune: this._param(0),
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: this._param(1000),
        Q: this._param(1),
        gain: this._param(0),
        connect: () => {},
        disconnect: () => {},
      };
    }
    createBuffer(channels, length, sampleRate) {
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        playbackRate: this._param(1),
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {},
      };
    }
    createStereoPanner() {
      return { pan: this._param(0), connect: () => {}, disconnect: () => {} };
    }
    createDynamicsCompressor() {
      return {
        threshold: this._param(-24),
        knee: this._param(30),
        ratio: this._param(12),
        attack: this._param(0.003),
        release: this._param(0.25),
        connect: () => {},
        disconnect: () => {},
      };
    }
  };
}

function createBrowserEnv({
  htmlPath,
  assetsDir,
  includeAndroidBridge = true,
  withGyroSupport = true,
  storageOptions = {},
} = {}) {
  const { html, scriptTags } = parseIndexHtml(htmlPath);
  const storage = new MockStorage(storageOptions);
  const errors = [];
  let rafIdCounter = 1;
  let rafCallbacks = new Map();
  let nowMs = 1000;

  const doc = {
    nodeType: 9,
    hidden: false,
    visibilityState: 'visible',
    readyState: 'complete',
    _byId: new Map(),
    _listeners: new Map(),
    head: null,
    body: null,
    documentElement: null,
    createElement(tag) {
      const t = String(tag).toLowerCase();
      if (t === 'canvas') return new MockCanvas(doc);
      if (t === 'img') return new MockImage();
      return new MockElement(t, doc);
    },
    createElementNS(_ns, tag) {
      return doc.createElement(tag);
    },
    createTextNode(txt) {
      return { nodeType: 3, textContent: String(txt || '') };
    },
    getElementById(id) {
      return doc._byId.get(String(id)) || null;
    },
    querySelector(sel) {
      return doc.documentElement ? doc.documentElement.querySelector(sel) : null;
    },
    querySelectorAll(sel) {
      return doc.documentElement ? doc.documentElement.querySelectorAll(sel) : [];
    },
    getElementsByTagName(tag) {
      return doc.documentElement ? doc.documentElement.getElementsByTagName(tag) : [];
    },
    getElementsByClassName(cls) {
      return doc.documentElement ? doc.documentElement.getElementsByClassName(cls) : [];
    },
    addEventListener(type, fn) {
      if (!doc._listeners.has(type)) doc._listeners.set(type, new Set());
      doc._listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (doc._listeners.has(type)) doc._listeners.get(type).delete(fn);
    },
    dispatchEvent(evt) {
      const set = doc._listeners.get(evt.type);
      if (set) {
        for (const fn of Array.from(set)) fn.call(doc, evt);
      }
      return true;
    },
  };

  const root = new MockElement('html', doc);
  doc.documentElement = root;
  parseHtmlFragmentInto(html, root, doc);
  doc.head = root.querySelector('head') || new MockElement('head', doc);
  doc.body = root.querySelector('body') || new MockElement('body', doc);

  const winListeners = new Map();
  const MockAudioCtx = createMockAudioContextClass();

  const androidBridgeState = {
    gyroEnabled: false,
    tilt: 0,
    calibrations: 0,
    exited: false,
    assetsRead: [],
  };
  const AndroidBridge = includeAndroidBridge
    ? {
        setGyroEnabled(b) {
          androidBridgeState.gyroEnabled = Boolean(b);
        },
        getTilt() {
          return androidBridgeState.tilt;
        },
        calibrateGyro() {
          androidBridgeState.calibrations += 1;
        },
        readAssetBase64(assetPath) {
          if (!assetsDir || !assetPath) return null;
          let clean = String(assetPath).trim();
          while (clean.startsWith('/') || clean.startsWith('./')) {
            clean = clean.startsWith('/') ? clean.slice(1) : clean.slice(2);
          }
          if (!clean || clean.includes('..') || clean.includes('\\')) return null;
          const baseDir = path.resolve(assetsDir);
          const resolved = path.resolve(baseDir, clean);
          if (!resolved.startsWith(baseDir + path.sep) || !fs.existsSync(resolved)) return null;
          androidBridgeState.assetsRead.push(clean);
          return fs.readFileSync(resolved).toString('base64');
        },
        exitApp() {
          androidBridgeState.exited = true;
        },
        isNativeAndroid() {
          return true;
        },
      }
    : undefined;

  class MockImage {
    constructor() {
      this.tagName = 'IMG';
      this.style = {};
      this.width = 64;
      this.height = 64;
      this.complete = false;
      this._listeners = {};
    }
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    }
    removeEventListener(type, fn) {
      if (!this._listeners[type]) return;
      this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
    }
    set src(v) {
      this._src = v;
      this.complete = true;
      setTimeout(() => {
        if (typeof this.onload === 'function') this.onload();
        const cbs = (this._listeners.load || []).slice();
        for (const cb of cbs) cb.call(this);
      }, 0);
    }
    get src() {
      return this._src || '';
    }
  }

  class MockEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
      this.defaultPrevented = false;
    }
    preventDefault() {
      this.defaultPrevented = true;
    }
    stopPropagation() {
      this._stopped = true;
    }
  }

  const sandbox = {
    console,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Date,
    RegExp,
    JSON,
    Error,
    TypeError,
    RangeError,
    Promise,
    TextDecoder,
    atob,
    btoa,
    Uint8Array,
    Uint8ClampedArray,
    Int16Array,
    Uint16Array,
    Int32Array,
    Uint32Array,
    Float32Array,
    Float64Array,
    ArrayBuffer,
    DataView,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: doc,
    HTMLElement: MockElement,
    HTMLCanvasElement: MockCanvas,
    SVGElement: MockElement,
    Image: MockImage,
    Event: MockEvent,
    CustomEvent: MockEvent,
    PointerEvent: MockEvent,
    KeyboardEvent: MockEvent,
    MouseEvent: MockEvent,
    TouchEvent: MockEvent,
    WebGLRenderingContext: function WebGLRenderingContext() {},
    WebGL2RenderingContext: function WebGL2RenderingContext() {},
    AudioContext: MockAudioCtx,
    webkitAudioContext: MockAudioCtx,
    localStorage: storage,
    sessionStorage: new MockStorage(),
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 2,
    screen: { orientation: { angle: 90, type: 'landscape-primary' } },
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 },
    location: {
      protocol: 'file:',
      href: 'file:///android_asset/index.html',
      pathname: '/android_asset/index.html',
    },
    performance: {
      now: () => nowMs,
    },
    requestAnimationFrame(cb) {
      const id = rafIdCounter++;
      rafCallbacks.set(id, cb);
      return id;
    },
    cancelAnimationFrame(id) {
      rafCallbacks.delete(id);
    },
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    getComputedStyle: () => ({
      getPropertyValue: () => '',
    }),
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    },
    Blob: class MockBlob {
      constructor(parts = []) {
        this.parts = parts;
      }
    },
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (winListeners.has(type)) winListeners.get(type).delete(fn);
    },
    dispatchEvent(evt) {
      const set = winListeners.get(evt.type);
      if (set) {
        for (const fn of Array.from(set)) fn.call(sandbox, evt);
      }
      return true;
    },
    alert: () => {},
    confirm: () => true,
  };

  if (withGyroSupport) {
    sandbox.DeviceOrientationEvent = MockEvent;
    sandbox.ondeviceorientation = null;
  }
  if (AndroidBridge) {
    sandbox.AndroidBridge = AndroidBridge;
  }

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);

  function runScriptFile(absPath) {
    const code = fs.readFileSync(absPath, 'utf8');
    try {
      vm.runInContext(code, ctx, { filename: absPath });
    } catch (err) {
      errors.push({ file: absPath, err });
      throw err;
    }
  }

  function loadAllIndexScripts({ dispatchDomReady = true } = {}) {
    const loaded = [];
    for (const tag of scriptTags) {
      if (!tag.src) continue;
      const resolved = path.resolve(assetsDir, tag.src);
      runScriptFile(resolved);
      loaded.push(tag.src);
    }
    if (dispatchDomReady) {
      try {
        doc.dispatchEvent(new MockEvent('DOMContentLoaded'));
        sandbox.dispatchEvent(new MockEvent('load'));
      } catch (err) {
        errors.push({ phase: 'DOMContentLoaded/load', err });
        throw err;
      }
    }
    return loaded;
  }

  function tickRaf(frames = 1, dtMs = 16.6667) {
    for (let f = 0; f < frames; f++) {
      nowMs += dtMs;
      const pending = Array.from(rafCallbacks.values());
      rafCallbacks.clear();
      for (const cb of pending) {
        try {
          cb(nowMs);
        } catch (err) {
          errors.push({ frame: f, err });
          throw err;
        }
      }
    }
  }

  return {
    sandbox,
    window: sandbox,
    document: doc,
    storage,
    errors,
    scriptTags,
    html,
    androidBridgeState,
    runScriptFile,
    loadAllIndexScripts,
    tickRaf,
    advanceTime(ms) {
      nowMs += ms;
    },
    getRafCount() {
      return rafCallbacks.size;
    },
  };
}

module.exports = {
  MockElement,
  MockCanvas,
  MockStorage,
  parseIndexHtml,
  createBrowserEnv,
};
