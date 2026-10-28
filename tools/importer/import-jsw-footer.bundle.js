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

  // tools/importer/import-jsw-footer.js
  var import_jsw_footer_exports = {};
  __export(import_jsw_footer_exports, {
    default: () => import_jsw_footer_default
  });
  function clean(text) {
    return (text || "").replace(/[​\s]+/g, " ").trim();
  }
  function rootRelative(src) {
    try {
      const base = "https://root.invalid";
      const u = new URL(src, base);
      if (u.origin !== base) return src;
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
  function imageCell(document, field, source) {
    if (!source) return hinted(document, field);
    const img = document.createElement("img");
    img.src = rootRelative(source.getAttribute("src"));
    img.alt = clean(source.getAttribute("alt"));
    return hinted(document, field, img);
  }
  function linkCell(document, field, link, label) {
    if (!link) return hinted(document, field);
    const a = document.createElement("a");
    a.href = rootRelative(link.getAttribute("href"));
    a.textContent = label || a.href;
    const p = document.createElement("p");
    p.append(a);
    return hinted(document, field, p);
  }
  var import_jsw_footer_default = {
    transform: (payload) => {
      var _a, _b;
      const { document } = payload;
      const src = document.querySelector(".jsw-footer-source");
      const main = document.createElement("main");
      const value = (root, sel) => {
        var _a2;
        return clean((_a2 = root.querySelector(sel)) == null ? void 0 : _a2.textContent);
      };
      const logoLink = src.querySelector(":scope > a.logo-link");
      const cta = src.querySelector(":scope > a.cta");
      const legal = src.querySelector(":scope > a.legal");
      main.append(WebImporter.Blocks.createBlock(document, {
        name: "jsw-footer",
        cells: [
          [imageCell(document, "logo", src.querySelector(":scope > img.logo"))],
          [linkCell(document, "logoLink", logoLink, clean(logoLink == null ? void 0 : logoLink.getAttribute("href")))],
          [textCell(document, "copyright", value(src, ":scope > .copyright"))],
          [textCell(document, "location", value(src, ":scope > .location"))],
          [linkCell(document, "ctaLink", cta, clean(cta == null ? void 0 : cta.textContent))],
          [linkCell(document, "legalLink", legal, clean(legal == null ? void 0 : legal.textContent))],
          [imageCell(document, "background", src.querySelector(":scope > img.background"))]
        ]
      }));
      src.querySelectorAll(":scope > .column").forEach((column) => {
        const social = column.classList.contains("social");
        const cells = [[textCell(document, "title", value(column, "h2"))]];
        column.querySelectorAll("a[href]").forEach((a) => {
          if (social) {
            cells.push([
              textCell(document, "network", clean(a.dataset.network)),
              linkCell(document, "link", a, clean(a.getAttribute("href")))
            ]);
          } else cells.push([linkCell(document, "link", a, clean(a.textContent))]);
        });
        main.append(WebImporter.Blocks.createBlock(document, { name: social ? "jsw-footer-social" : "jsw-footer-links", cells }));
      });
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        nav: clean((_a = document.querySelector('meta[name="nav"]')) == null ? void 0 : _a.getAttribute("content")),
        footer: clean((_b = document.querySelector('meta[name="footer"]')) == null ? void 0 : _b.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/jsw-footer",
        report: { title: document.title, template: "jsw-footer", blocks: ["jsw-footer", "jsw-footer-links", "jsw-footer-social"] }
      }];
    }
  };
  return __toCommonJS(import_jsw_footer_exports);
})();
