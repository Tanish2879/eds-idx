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
  function link(document, a, child) {
    const out = document.createElement("a");
    out.href = rootRelative(a.getAttribute("href"));
    out.append(child || document.createTextNode(clean(a.textContent)));
    return out;
  }
  function brand(document, src) {
    const section = document.createElement("div");
    const a = src.querySelector("a[href]");
    const img = src.querySelector("img");
    if (!a || !img) return section;
    const out = document.createElement("img");
    out.src = rootRelative(img.getAttribute("src"));
    out.alt = clean(img.getAttribute("alt"));
    const p = document.createElement("p");
    p.append(link(document, a, out));
    section.append(p);
    return section;
  }
  function sections(document, src) {
    const section = document.createElement("div");
    const ul = document.createElement("ul");
    src.querySelectorAll("li a[href]").forEach((a) => {
      const li = document.createElement("li");
      li.append(link(document, a));
      ul.append(li);
    });
    section.append(ul);
    return section;
  }
  function tools(document, src) {
    const section = document.createElement("div");
    src.querySelectorAll("a[href]").forEach((a) => {
      const p = document.createElement("p");
      p.append(link(document, a));
      section.append(p);
    });
    return section;
  }
  var import_jsw_nav_default = {
    transform: (payload) => {
      const { document } = payload;
      const main = document.createElement("main");
      main.append(brand(document, document.querySelector(".brand")));
      main.append(document.createElement("hr"));
      main.append(sections(document, document.querySelector(".sections")));
      main.append(document.createElement("hr"));
      main.append(tools(document, document.querySelector(".tools")));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/jsw-nav",
        report: { title: "JSW Motors navigation", template: "nav" }
      }];
    }
  };
  return __toCommonJS(import_jsw_nav_exports);
})();
