/*
 * The hero carousel's slide transition, drawn with WebGL on a canvas over the
 * slides while it runs. The current slide pulls away to the left (to the right
 * going back) from its middle, revealing the next slide in place beneath it:
 * - its trailing edge is an arc, x = (1 - p) - bulge * cos((y - 0.5) * PI), a
 *   hard cut, set in at the middle and level with (1 - p) at the corners
 * - just behind the edge its image is stretched out towards it, like the edge
 *   of a lens, fading out over BAND of the width
 * - it's blurred along its path in step with its speed
 * - the next slide drifts in a little (the parallax) and starts blurred,
 *   sharpening over the last SETTLE_MS
 * The timing, easing, bulge and drift come from the carousel's styles, so the
 * CSS fallback (no WebGL) moves the same way.
 */

// width of the stretched band behind the edge, of the slide width
const BAND = 0.12;
// how much the image is stretched at the edge itself (0: none, 1: all of it)
const STRETCH = 0.6;
// blur length of the current slide at its fastest, of the width
const BLUR_FROM = 0.04;
// blur length of the next slide until it settles, of the width
const BLUR_TO = 0.015;
const SETTLE_MS = 200;
// the edge curves and the stretch builds over this much of the way, so
// neither appears all at once
const RAMP = 0.1;
const MAX_DPR = 2;

const VERTEX = `
attribute vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }
`;

const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec4 uFromFit;
uniform vec4 uToFit;
uniform vec2 uSize;
uniform float uBack;
uniform float uProgress;
uniform float uBulge;
uniform float uBand;
uniform float uStretch;
uniform float uFromBlur;
uniform float uToBlur;
uniform float uDrift;

// x runs the way the slide leaves (mirrored going back), y down; fit maps the
// slide onto its image like object-fit: cover
vec4 tap(sampler2D tex, vec4 fit, float x, float y) {
  vec2 p = clamp(vec2(mix(x, 1.0 - x, uBack), y), 0.0, 1.0);
  return texture2D(tex, fit.zw + p * fit.xy);
}

// horizontal-only blur over len of the width
vec4 smear(sampler2D tex, vec4 fit, float x, float y, float len) {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = 0; i < 15; i++) {
    float k = float(i) / 14.0 - 0.5;
    float w = 1.0 - abs(k);
    sum += tap(tex, fit, x + k * len, y) * w;
    total += w;
  }
  return sum / total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float y = 1.0 - uv.y;
  float x = mix(uv.x, 1.0 - uv.x, uBack);
  float edge = 1.0 - uProgress - uBulge * cos((y - 0.5) * 3.14159265);
  float px = 1.0 / uSize.x;
  vec4 from = vec4(0.0);
  vec4 to = vec4(0.0);
  if (x < edge + px) {
    // d runs 0 to 1 across the band; sampling eases off towards the edge, so
    // the pixels there are drawn out
    float d = clamp((edge - x) / uBand, 0.0, 1.0);
    float stretched = x + uBand * uStretch * d * (1.0 - d) * (1.0 - d);
    from = smear(uFrom, uFromFit, stretched + uProgress, y, uFromBlur);
  }
  if (x > edge - px) {
    to = smear(uTo, uToFit, x - uDrift, y, uToBlur);
  }
  // one pixel of coverage, so the cut is clean rather than stepped
  gl_FragColor = mix(to, from, clamp((edge - x) / px * 0.5 + 0.5, 0.0, 1.0));
}
`;

/**
* Builds an easing function from a cubic-bezier() timing function.
* @param {string} value a CSS timing function
* @returns {function(number): number} progress at a point in time (both 0-1)
*/
function easing(value) {
  const n = value.match(/cubic-bezier\(([^)]+)\)/)?.[1].split(',').map(Number);
  const [x1, y1, x2, y2] = n?.length === 4 && n.every(Number.isFinite) ? n : [0.7, 0, 0.2, 1];
  const at = (a, b, s) => (3 * a * s * (1 - s) ** 2) + (3 * b * s * s * (1 - s)) + s ** 3;
  return (t) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/**
* Reads a CSS duration.
* @param {string} value e.g. 750ms or 0.75s
* @returns {number} milliseconds
*/
function ms(value) {
  const n = parseFloat(value) || 0;
  return value.trim().endsWith('ms') ? n : n * 1000;
}

/**
* The image, playing video or video still a slide shows.
* @param {Element} slide a slide
* @returns {HTMLImageElement|HTMLVideoElement|null} null while there's nothing
*/
function mediaOf(slide) {
  const video = slide.querySelector('video.video');
  if (video && slide.classList.contains('is-playing') && video.readyState >= 2) return video;
  const still = slide.querySelector('.video-still');
  if (still) return still.readyState >= 2 ? still : null;
  const img = slide.querySelector('img');
  return img?.complete && img.naturalWidth ? img : null;
}

/**
* Maps the canvas onto an image the way object-fit: cover does, with its
* object-position.
* @param {HTMLImageElement|HTMLVideoElement|null} el the image
* @param {number} width canvas width
* @param {number} height canvas height
* @returns {number[]} the share of the image across and down, and its offset
*/
function cover(el, width, height) {
  const w = el?.videoWidth || el?.naturalWidth;
  const h = el?.videoHeight || el?.naturalHeight;
  if (!w || !h) return [1, 1, 0, 0];
  const at = getComputedStyle(el).objectPosition.split(' ')
    .map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
  const [px, py] = [at[0] ?? 0.5, at[1] ?? 0.5];
  const fx = Math.min(1, (width / height) / (w / h));
  const fy = Math.min(1, (w / h) / (width / height));
  return [fx, fy, px * (1 - fx), py * (1 - fy)];
}

/**
* Sets up the WebGL transition for a carousel's slides.
* @param {Element} stack the slides' container
* @returns {{ run: function(Element, Element, boolean): boolean }|null} run draws
* a transition from one slide to another (false if it can't, so the CSS
* transition runs instead); null without WebGL
*/
export default function createSlideTransition(stack) {
  const canvas = document.createElement('canvas');
  canvas.className = 'slide-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.hidden = true;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false });
  if (!gl) return null;

  const shader = (type, source) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram();
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const a = gl.getAttribLocation(program, 'a');
  gl.enableVertexAttribArray(a);
  gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

  const u = {};
  ['uFrom', 'uTo', 'uFromFit', 'uToFit', 'uSize', 'uBack', 'uProgress', 'uBulge', 'uBand',
    'uStretch', 'uFromBlur', 'uToBlur', 'uDrift'].forEach((name) => {
    u[name] = gl.getUniformLocation(program, name);
  });

  const textures = [0, 1].map((unit) => {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  });
  gl.uniform1i(u.uFrom, 0);
  gl.uniform1i(u.uTo, 1);

  // throws for media from another origin without CORS
  const black = new Uint8Array([0, 0, 0, 255]);
  const upload = (unit, el) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, textures[unit]);
    if (el) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, black);
  };

  let frame = 0;
  let broken = false;
  const stop = () => {
    cancelAnimationFrame(frame);
    canvas.hidden = true;
  };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    broken = true;
    stop();
  });
  stack.append(canvas);

  const run = (from, to, back) => {
    stop();
    const style = getComputedStyle(stack);
    const duration = ms(style.getPropertyValue('--hero-slide-push'));
    if (broken || !duration) return false;
    const ease = easing(style.getPropertyValue('--hero-slide-ease'));
    const bulge = (parseFloat(style.getPropertyValue('--hero-slide-bulge')) || 0) / 100;
    const drift = (parseFloat(style.getPropertyValue('--hero-slide-parallax')) || 0) / 100;
    // the current slide's blur follows its speed, relative to its fastest
    const h = 0.004;
    const speedAt = (t) => (ease(Math.min(1, t + h)) - ease(Math.max(0, t - h))) / (2 * h);
    let peak = 0;
    for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, speedAt(t));

    // a texture is uploaded again only when its slide's picture changes: a
    // video's next frame, or the image or video it's been waiting for
    const slides = [from, to];
    const media = [undefined, undefined];
    const shown = [undefined, undefined];
    const refresh = () => slides.forEach((slide, unit) => {
      if (media[unit] instanceof HTMLImageElement) return;
      const el = mediaOf(slide);
      const at = el?.currentTime;
      if (el === media[unit] && at === shown[unit]) return;
      upload(unit, el);
      media[unit] = el;
      shown[unit] = at;
    });

    const start = performance.now();
    const draw = (now) => {
      const rect = stack.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      refresh();

      const elapsed = now - start;
      const t = Math.min(1, Math.max(0, elapsed / duration));
      const p = ease(t);
      const r = Math.min(1, p / RAMP);
      const ramp = r * r * (3 - 2 * r);
      const settle = Math.min(1, Math.max(0, (duration - elapsed) / SETTLE_MS));
      gl.uniform4fv(u.uFromFit, cover(media[0], width, height));
      gl.uniform4fv(u.uToFit, cover(media[1], width, height));
      gl.uniform2f(u.uSize, width, height);
      gl.uniform1f(u.uBack, back ? 1 : 0);
      gl.uniform1f(u.uProgress, p);
      gl.uniform1f(u.uBulge, bulge * ramp);
      gl.uniform1f(u.uBand, BAND);
      gl.uniform1f(u.uStretch, STRETCH * ramp);
      gl.uniform1f(u.uFromBlur, BLUR_FROM * (peak ? speedAt(t) / peak : 0));
      gl.uniform1f(u.uToBlur, BLUR_TO * settle * settle * (3 - 2 * settle));
      gl.uniform1f(u.uDrift, drift * (1 - p));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return t < 1;
    };
    // if a frame fails, the canvas goes and the slides beneath (already
    // switched) show, and the CSS transition takes over from then on
    const safely = (now) => {
      try {
        return draw(now);
      } catch {
        broken = true;
        return false;
      }
    };
    const tick = (now) => {
      if (safely(now)) frame = requestAnimationFrame(tick);
      else stop();
    };

    // the first frame is drawn before the slides switch beneath it
    if (!safely(start)) return false;
    canvas.hidden = false;
    frame = requestAnimationFrame(tick);
    return true;
  };

  return { run };
}
