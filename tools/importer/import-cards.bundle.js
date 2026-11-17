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

  // tools/importer/import-cards.js
  var import_cards_exports = {};
  __export(import_cards_exports, {
    default: () => import_cards_default
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
  function imageCell(document, field, source) {
    if (!source) return hinted(document, field);
    const img = document.createElement("img");
    img.src = rootRelative(source.getAttribute("src"));
    img.alt = clean(source.getAttribute("alt"));
    const picture = document.createElement("picture");
    picture.append(img);
    const p = document.createElement("p");
    p.append(picture);
    return hinted(document, field, p);
  }
  function textCell(document, field, source) {
    if (!source) return hinted(document, field);
    const nodes = [...source.children].map((child) => child.cloneNode(true));
    return hinted(document, field, ...nodes);
  }
  var import_cards_default = {
    transform: (payload) => {
      var _a, _b, _c, _d;
      const { document } = payload;
      const main = document.createElement("main");
      const styles = [];
      document.querySelectorAll(".cards-source").forEach((source, i) => {
        if (i) main.append(document.createElement("hr"));
        const heading = source.querySelector(":scope > h2");
        if (heading) {
          const h2 = document.createElement("h2");
          h2.textContent = clean(heading.textContent);
          main.append(h2);
        }
        const style = clean(source.dataset.style);
        styles.push(style || "default");
        const cells = [...source.querySelectorAll(":scope > .card")].map((card) => [
          imageCell(document, "image", card.querySelector("img")),
          textCell(document, "text", card.querySelector(".text"))
        ]);
        main.append(WebImporter.Blocks.createBlock(document, { name: "cards", variants: style ? [style] : [], cells }));
      });
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content")),
        nav: clean((_b = document.querySelector('meta[name="nav"]')) == null ? void 0 : _b.getAttribute("content")),
        footer: clean((_c = document.querySelector('meta[name="footer"]')) == null ? void 0 : _c.getAttribute("content")),
        // the JSW theme (a class on the body): the design tokens the cards block reads (styles.css)
        Theme: clean((_d = document.querySelector('meta[name="theme"]')) == null ? void 0 : _d.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/jsw/cards",
        report: { title: document.title, template: "cards", blocks: ["cards"], styles }
      }];
    }
  };
  return __toCommonJS(import_cards_exports);
})();
