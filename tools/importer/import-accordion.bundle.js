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

  // tools/importer/import-accordion.js
  var import_accordion_exports = {};
  __export(import_accordion_exports, {
    default: () => import_accordion_default
  });
  function clean(text) {
    return (text || "").replace(/[​\s]+/g, " ").trim();
  }
  function rootRelative(href) {
    try {
      const u = new URL(href, "https://x");
      return u.origin === "https://x" ? u.pathname + u.search + u.hash : href;
    } catch (e) {
      return href;
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
  function richCell(document, field, source) {
    if (!source) return hinted(document, field);
    const nodes = [...source.children].map((child) => {
      const copy = child.cloneNode(true);
      copy.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", rootRelative(a.getAttribute("href"))));
      return copy;
    });
    return hinted(document, field, ...nodes);
  }
  var import_accordion_default = {
    transform: (payload) => {
      var _a, _b, _c, _d;
      const { document } = payload;
      const src = document.querySelector(".accordion-source");
      const main = document.createElement("main");
      const heading = src.querySelector(":scope > h2");
      if (heading) {
        const h2 = document.createElement("h2");
        h2.textContent = clean(heading.textContent);
        main.append(h2);
      }
      const cells = [...src.querySelectorAll(":scope > .item")].map((item) => {
        var _a2;
        return [
          textCell(document, "summary", clean((_a2 = item.querySelector(".title")) == null ? void 0 : _a2.textContent)),
          richCell(document, "text", item.querySelector(".content"))
        ];
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: "accordion", cells }));
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content")),
        nav: clean((_b = document.querySelector('meta[name="nav"]')) == null ? void 0 : _b.getAttribute("content")),
        footer: clean((_c = document.querySelector('meta[name="footer"]')) == null ? void 0 : _c.getAttribute("content")),
        Theme: clean((_d = document.querySelector('meta[name="theme"]')) == null ? void 0 : _d.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/jsw/accordion",
        report: { title: document.title, template: "accordion", blocks: ["accordion"] }
      }];
    }
  };
  return __toCommonJS(import_accordion_exports);
})();
