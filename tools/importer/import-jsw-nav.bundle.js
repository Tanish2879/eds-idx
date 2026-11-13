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

  // tools/importer/import-jsw-nav.js
  var import_jsw_nav_exports = {};
  __export(import_jsw_nav_exports, {
    default: () => import_jsw_nav_default
  });
  var LINKS = 4;
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
  function linkCell(document, field, a, label) {
    if (!a) return hinted(document, field);
    const out = document.createElement("a");
    out.href = rootRelative(a.getAttribute("href"));
    out.textContent = label || out.href;
    const p = document.createElement("p");
    p.append(out);
    return hinted(document, field, p);
  }
  var import_jsw_nav_default = {
    transform: (payload) => {
      var _a;
      const { document } = payload;
      const main = document.createElement("main");
      const brand = document.querySelector(".brand");
      const logoLink = brand == null ? void 0 : brand.querySelector("a[href]");
      const logo = brand == null ? void 0 : brand.querySelector("img");
      const img = logo ? document.createElement("img") : null;
      if (img) {
        img.src = rootRelative(logo.getAttribute("src"));
        img.alt = clean(logo.getAttribute("alt"));
      }
      const links = [...document.querySelectorAll(".sections li a[href]")].slice(0, LINKS);
      const cta = document.querySelector(".tools a[href]");
      const cells = [
        [hinted(document, "logo", ...img ? [img] : [])],
        [textCell(document, "brandName", clean((_a = brand == null ? void 0 : brand.querySelector(".brand-name")) == null ? void 0 : _a.textContent))],
        [linkCell(document, "logoLink", logoLink, clean(logoLink == null ? void 0 : logoLink.getAttribute("href")))],
        ...[0, 1, 2, 3].map((i) => {
          var _a2;
          return [linkCell(document, `link${i + 1}`, links[i], clean((_a2 = links[i]) == null ? void 0 : _a2.textContent))];
        }),
        [linkCell(document, "cta", cta, clean(cta == null ? void 0 : cta.textContent))]
      ];
      main.append(WebImporter.Blocks.createBlock(document, { name: "jsw-nav", cells }));
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        nav: "off",
        footer: "off"
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/jsw/jsw-nav",
        report: { title: document.title, template: "jsw-nav", blocks: ["jsw-nav"] }
      }];
    }
  };
  return __toCommonJS(import_jsw_nav_exports);
})();
