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

  // tools/importer/import-careers.js
  var import_careers_exports = {};
  __export(import_careers_exports, {
    default: () => import_careers_default
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
  function linkCell(document, field, href) {
    if (!href) return hinted(document, field);
    const a = document.createElement("a");
    a.href = rootRelative(href);
    a.textContent = rootRelative(href);
    const p = document.createElement("p");
    p.append(a);
    return hinted(document, field, p);
  }
  function idCell(document, id) {
    const cell = document.createElement("div");
    cell.textContent = id;
    return cell;
  }
  var import_careers_default = {
    transform: (payload) => {
      var _a, _b, _c;
      const { document } = payload;
      const src = document.querySelector(".job-board-source");
      const main = document.createElement("main");
      const value = (root, sel) => {
        var _a2;
        return clean((_a2 = root.querySelector(sel)) == null ? void 0 : _a2.textContent);
      };
      const hero = document.querySelector(".careers-hero-source");
      if (hero) {
        const cta = hero.querySelector("a.cta");
        main.append(WebImporter.Blocks.createBlock(document, {
          name: "careers-hero",
          cells: [
            [imageCell(document, "image", hero.querySelector("img.image"))],
            [textCell(document, "heading", value(hero, "h1"))],
            [textCell(document, "description", value(hero, ".description"))],
            [textCell(document, "ctaLabel", clean(cta == null ? void 0 : cta.textContent))],
            [textCell(document, "ctaLink", clean(cta == null ? void 0 : cta.getAttribute("href")))]
          ]
        }));
        main.append(document.createElement("hr"));
      }
      const cells = [];
      cells.push([imageCell(document, "gallery", src.querySelector(":scope > img.gallery"))]);
      cells.push([textCell(document, "emptyMessage", value(src, ":scope > .empty"))]);
      src.querySelectorAll(".item").forEach((item) => {
        if (item.classList.contains("search")) {
          cells.push([
            idCell(document, "job-board-search"),
            textCell(document, "heading", value(item, ".heading")),
            textCell(document, "headingEmphasis", value(item, ".heading-emphasis")),
            textCell(document, "placeholder", clean(item.dataset.placeholder)),
            textCell(document, "description", value(item, ".description"))
          ]);
        } else if (item.classList.contains("filters")) {
          cells.push([
            idCell(document, "job-board-filters"),
            textCell(document, "filterLabel", clean(item.dataset.label)),
            textCell(document, "locationLabel", clean(item.dataset.locationLabel)),
            hinted(document, "locations"),
            textCell(document, "departmentLabel", clean(item.dataset.departmentLabel)),
            hinted(document, "departments")
          ]);
        } else {
          const link = item.querySelector("a[href]");
          cells.push([
            idCell(document, "job-board-job"),
            textCell(document, "title", value(item, "h3")),
            textCell(document, "department", clean(item.dataset.department)),
            textCell(document, "location", clean(item.dataset.location)),
            textCell(document, "description", value(item, "p")),
            linkCell(document, "applyLink", link == null ? void 0 : link.getAttribute("href")),
            textCell(document, "applyLabel", clean(link == null ? void 0 : link.textContent))
          ]);
        }
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: "job-board", cells }));
      const perks = document.querySelector(".careers-perks-source");
      if (perks) {
        main.append(document.createElement("hr"));
        const intro = perks.querySelector(".intro");
        const introP = document.createElement("p");
        introP.textContent = clean([...(intro == null ? void 0 : intro.childNodes) || []].map((n) => n.nodeName === "BR" ? " " : n.textContent).join(" "));
        const perkCells = [
          [textCell(document, "heading", value(perks, "h2"))],
          [introP.textContent ? hinted(document, "intro", introP) : hinted(document, "intro")]
        ];
        perks.querySelectorAll(".perk").forEach((perk) => {
          perkCells.push([
            idCell(document, "careers-perk"),
            textCell(document, "icon", clean(perk.dataset.icon)),
            hinted(document, "iconImage"),
            textCell(document, "title", value(perk, "h3")),
            textCell(document, "description", value(perk, "p"))
          ]);
        });
        main.append(WebImporter.Blocks.createBlock(document, { name: "careers-perks", cells: perkCells }));
      }
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content")),
        nav: clean((_b = document.querySelector('meta[name="nav"]')) == null ? void 0 : _b.getAttribute("content")),
        footer: clean((_c = document.querySelector('meta[name="footer"]')) == null ? void 0 : _c.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/careers",
        report: { title: document.title, template: "careers", blocks: ["careers-hero", "job-board", "careers-perks"] }
      }];
    }
  };
  return __toCommonJS(import_careers_exports);
})();
