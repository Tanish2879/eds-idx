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

  // tools/importer/import-interactive-showcase.js
  var import_interactive_showcase_exports = {};
  __export(import_interactive_showcase_exports, {
    default: () => import_interactive_showcase_default
  });
  var MAX_ITEMS = 3;
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
  function textCell(document, field, value) {
    if (!value) return hinted(document, field);
    const p = document.createElement("p");
    p.textContent = value;
    return hinted(document, field, p);
  }
  function picture(document, source) {
    const img = document.createElement("img");
    img.src = rootRelative(source.getAttribute("src"));
    img.alt = clean(source.getAttribute("alt"));
    const pic = document.createElement("picture");
    pic.append(img);
    const p = document.createElement("p");
    p.append(pic);
    return p;
  }
  function mediaCell(document, thumb, image) {
    const cell = document.createElement("div");
    cell.append(document.createComment(" field:media_thumbnail "));
    if (thumb) cell.append(picture(document, thumb));
    cell.append(document.createComment(" field:media_image "));
    if (image) cell.append(picture(document, image));
    return cell;
  }
  function listCell(document, field, list) {
    if (!list) return hinted(document, field);
    const ul = document.createElement("ul");
    list.querySelectorAll(":scope > li").forEach((li) => {
      const item = document.createElement("li");
      item.textContent = clean(li.textContent);
      ul.append(item);
    });
    return hinted(document, field, ul);
  }
  var import_interactive_showcase_default = {
    transform: (payload) => {
      var _a, _b, _c, _d, _e;
      const { document } = payload;
      const src = document.querySelector(".interactive-showcase-source");
      const main = document.createElement("main");
      const cells = [[textCell(document, "title", clean((_a = src.querySelector(":scope > h2")) == null ? void 0 : _a.textContent))]];
      [...src.querySelectorAll(":scope > article")].slice(0, MAX_ITEMS).forEach((item) => {
        var _a2, _b2;
        cells.push([
          mediaCell(document, item.querySelector("img.thumb"), item.querySelector("img.image")),
          textCell(document, "title", clean((_a2 = item.querySelector("h3")) == null ? void 0 : _a2.textContent)),
          textCell(document, "description", clean((_b2 = item.querySelector(".description")) == null ? void 0 : _b2.textContent)),
          listCell(document, "hotspots", item.querySelector("ul.hotspots"))
        ]);
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: "interactive-showcase", cells }));
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_b = document.querySelector('meta[name="description"]')) == null ? void 0 : _b.getAttribute("content")),
        nav: clean((_c = document.querySelector('meta[name="nav"]')) == null ? void 0 : _c.getAttribute("content")),
        footer: clean((_d = document.querySelector('meta[name="footer"]')) == null ? void 0 : _d.getAttribute("content")),
        Theme: clean((_e = document.querySelector('meta[name="theme"]')) == null ? void 0 : _e.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/jsw/interactive-showcase",
        report: { title: document.title, template: "interactive-showcase", blocks: ["interactive-showcase"] }
      }];
    }
  };
  return __toCommonJS(import_interactive_showcase_exports);
})();
