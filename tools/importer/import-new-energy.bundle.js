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
      return u.pathname + u.search;
    } catch (e) {
      return src;
    }
  }
  function hinted(document, field, ...nodes) {
    const cell = document.createElement("div");
    cell.append(document.createComment(` field:${field} `), ...nodes);
    return cell;
  }
  function image(document, img) {
    const out = document.createElement("img");
    out.src = rootRelative(img.getAttribute("src"));
    out.alt = clean(img.getAttribute("alt"));
    return out;
  }
  var import_new_energy_default = {
    transform: (payload) => {
      var _a;
      const { document } = payload;
      const src = document.querySelector(".hero-interactive-source");
      const main = document.createElement("main");
      const rows = [];
      const media = src.querySelector(".media img");
      if (media) rows.push([hinted(document, "media", image(document, media))]);
      const heading = src.querySelector(".heading");
      if (heading) rows.push([hinted(document, "heading", document.createTextNode(clean(heading.textContent)))]);
      const desc = src.querySelector(".description");
      if (desc) {
        const p = document.createElement("p");
        p.textContent = clean(desc.textContent);
        rows.push([hinted(document, "description", p)]);
      }
      const cta = src.querySelector(".cta");
      if (cta) {
        const a = document.createElement("a");
        a.href = cta.getAttribute("href");
        a.textContent = clean(cta.textContent);
        rows.push([hinted(document, "cta", a)]);
      }
      src.querySelectorAll(".slides img").forEach((img) => {
        rows.push([hinted(document, "image", image(document, img))]);
      });
      const block = WebImporter.Blocks.createBlock(document, { name: "hero-interactive", cells: rows });
      main.append(block);
      const meta = WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content"))
      });
      main.append(meta);
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/new-energy",
        report: { title: document.title, template: "new-energy", blocks: ["hero-interactive"] }
      }];
    }
  };
  return __toCommonJS(import_new_energy_exports);
})();
