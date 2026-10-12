/* eslint-disable */
var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // tools/importer/import-new-energy.js
  var import_new_energy_exports = {};
  __export(import_new_energy_exports, {
    default: () => import_new_energy_default
  });
  function clean(text) {
    return (text || "").replace(/[​\s]+/g, " ").trim();
  }
  function rootRelative(src) {
    try {
      const u = new URL(src, "https://x");
      return u.pathname + u.search + u.hash;
    } catch (e) {
      return src;
    }
  }
  function hinted(document, field, ...nodes) {
    const cell = document.createElement("div");
    cell.append(document.createComment(` field:${field} `), ...nodes);
    return cell;
  }
  function link(document, a) {
    const out = document.createElement("a");
    const href = a.getAttribute("href");
    out.href = href.startsWith("#") ? href : rootRelative(href);
    out.textContent = clean(a.textContent);
    return out;
  }
  var import_new_energy_default = {
    transform: (payload) => {
      var _a, _b, _c;
      const { document } = payload;
      const src = document.querySelector(".hero-video-source");
      const main = document.createElement("main");
      const rows = [];
      const media = document.createElement("div");
      const video = src.querySelector("a.video");
      if (video) {
        const p = document.createElement("p");
        p.append(link(document, video));
        media.append(document.createComment(" field:media_video "), p);
      }
      const poster = src.querySelector("img.poster");
      if (poster) {
        const img = document.createElement("img");
        img.src = rootRelative(poster.getAttribute("src"));
        img.alt = clean(poster.getAttribute("alt"));
        media.append(document.createComment(" field:media_poster "), img);
      }
      if (media.childNodes.length) rows.push([media]);
      const heading = src.querySelector("h1");
      const desc = src.querySelector(".description");
      if (heading || desc) {
        const nodes = [];
        if (heading) {
          const h1 = document.createElement("h1");
          h1.textContent = clean(heading.textContent);
          nodes.push(h1);
        }
        if (desc) {
          const p = document.createElement("p");
          p.textContent = clean(desc.textContent);
          nodes.push(p);
        }
        rows.push([hinted(document, "text", ...nodes)]);
      }
      const cta = src.querySelector("a.cta");
      if (cta) rows.push([hinted(document, "link", link(document, cta))]);
      const scroll = src.querySelector(".scroll");
      if (scroll) rows.push([hinted(document, "scrollLabel", document.createTextNode(clean(scroll.textContent)))]);
      main.append(WebImporter.Blocks.createBlock(document, { name: "hero-video", cells: rows }));
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content")),
        // JSW Motors nav document (pill header); the design has no footer
        nav: clean((_b = document.querySelector('meta[name="nav"]')) == null ? void 0 : _b.getAttribute("content")),
        footer: clean((_c = document.querySelector('meta[name="footer"]')) == null ? void 0 : _c.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/new-energy",
        report: { title: document.title, template: "new-energy", blocks: ["hero-video"] }
      }];
    }
  };
  return __toCommonJS(import_new_energy_exports);
})();
