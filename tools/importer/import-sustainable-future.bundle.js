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

  // tools/importer/import-sustainable-future.js
  var import_sustainable_future_exports = {};
  __export(import_sustainable_future_exports, {
    default: () => import_sustainable_future_default
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
  function el(document, tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  function collage(document, src) {
    const rows = [];
    const text = [];
    const h = src.querySelector("h1, h2");
    if (h) text.push(el(document, "h1", clean(h.textContent)));
    src.querySelectorAll(":scope > p").forEach((p) => text.push(el(document, "p", clean(p.textContent))));
    rows.push([hinted(document, "text", ...text)]);
    src.querySelectorAll(".images li").forEach((li) => {
      const img = li.querySelector("img");
      const out = document.createElement("img");
      out.src = rootRelative(img.getAttribute("src"));
      out.alt = clean(img.getAttribute("alt"));
      rows.push([
        hinted(document, "image", out),
        hinted(document, "position", document.createTextNode(clean(li.getAttribute("data-position"))))
      ]);
    });
    return WebImporter.Blocks.createBlock(document, { name: "parallax-collage", cells: rows });
  }
  var import_sustainable_future_default = {
    transform: (payload) => {
      var _a, _b, _c;
      const { document } = payload;
      const main = document.createElement("main");
      main.append(collage(document, document.querySelector(".parallax-collage-source")));
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content")),
        // JSW Motors nav document (pill header); the designs have no footer yet
        nav: clean((_b = document.querySelector('meta[name="nav"]')) == null ? void 0 : _b.getAttribute("content")),
        footer: clean((_c = document.querySelector('meta[name="footer"]')) == null ? void 0 : _c.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/sustainable-future",
        report: { title: document.title, template: "sustainable-future", blocks: ["parallax-collage"] }
      }];
    }
  };
  return __toCommonJS(import_sustainable_future_exports);
})();
