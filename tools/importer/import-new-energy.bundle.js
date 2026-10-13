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
      var _a, _b, _c, _d, _e;
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
      const showcase = document.querySelector(".engine-showcase-source");
      if (showcase) {
        const cells = [];
        const h2 = document.createElement("h2");
        h2.textContent = clean((_a = showcase.querySelector("h2")) == null ? void 0 : _a.textContent);
        cells.push([hinted(document, "headline", h2)]);
        const image = (source) => {
          const img = document.createElement("img");
          img.src = rootRelative(source.getAttribute("src"));
          img.alt = clean(source.getAttribute("alt"));
          return img;
        };
        showcase.querySelectorAll("article").forEach((art) => {
          var _a2, _b2, _c2;
          const media2 = document.createElement("div");
          const main2 = art.querySelector("img.main") || art.querySelector("img");
          media2.append(document.createComment(" field:media_image "), image(main2));
          const thumb = art.querySelector("img.thumb");
          if (thumb) media2.append(document.createComment(" field:media_thumbnail "), image(thumb));
          const framing = clean((_a2 = art.querySelector(".framing")) == null ? void 0 : _a2.textContent);
          if (framing) {
            const fp = document.createElement("p");
            fp.textContent = framing;
            media2.append(document.createComment(" field:media_framing "), fp);
          }
          const desc2 = document.createElement("p");
          desc2.textContent = clean((_b2 = art.querySelector(".description")) == null ? void 0 : _b2.textContent);
          const spots = [...art.querySelectorAll(".hotspots li")].map((li) => {
            const p = document.createElement("p");
            p.textContent = clean(li.textContent);
            return p;
          });
          cells.push([
            media2,
            hinted(document, "title", document.createTextNode(clean((_c2 = art.querySelector("h3")) == null ? void 0 : _c2.textContent))),
            hinted(document, "description", desc2),
            hinted(document, "hotspots", ...spots)
          ]);
        });
        main.append(document.createElement("hr"));
        main.append(WebImporter.Blocks.createBlock(document, { name: "engine-showcase", cells }));
      }
      const collage = document.querySelector(".parallax-collage-source");
      if (collage) {
        const rowsC = [];
        const text = [];
        const h = collage.querySelector("h1, h2");
        if (h) {
          const h2 = document.createElement("h2");
          h2.textContent = clean(h.textContent);
          text.push(h2);
        }
        collage.querySelectorAll(":scope > p").forEach((para) => {
          const out = document.createElement("p");
          out.textContent = clean(para.textContent);
          text.push(out);
        });
        rowsC.push([hinted(document, "text", ...text)]);
        collage.querySelectorAll(".images li").forEach((li) => {
          const src2 = li.querySelector("img");
          const img = document.createElement("img");
          img.src = rootRelative(src2.getAttribute("src"));
          img.alt = clean(src2.getAttribute("alt"));
          rowsC.push([
            hinted(document, "image", img),
            hinted(document, "position", document.createTextNode(clean(li.getAttribute("data-position"))))
          ]);
        });
        main.append(document.createElement("hr"));
        main.append(WebImporter.Blocks.createBlock(document, { name: "parallax-collage", cells: rowsC }));
      }
      const blogs = document.querySelector(".blog-carousel-source");
      if (blogs) {
        const cells = [];
        const heading2 = clean((_b = blogs.querySelector("h2")) == null ? void 0 : _b.textContent);
        if (heading2) cells.push([hinted(document, "heading", document.createTextNode(heading2))]);
        const backdrop = blogs.querySelector("img.backdrop");
        if (backdrop) {
          const img = document.createElement("img");
          img.src = rootRelative(backdrop.getAttribute("src"));
          img.alt = clean(backdrop.getAttribute("alt"));
          cells.push([hinted(document, "image", img)]);
        }
        blogs.querySelectorAll("article").forEach((art) => {
          var _a2, _b2, _c2;
          const desc2 = document.createElement("p");
          desc2.textContent = clean((_a2 = art.querySelector(".description")) == null ? void 0 : _a2.textContent);
          const a = art.querySelector("a");
          const p = document.createElement("p");
          if (a) p.append(link(document, a));
          cells.push([
            hinted(document, "eyebrow", document.createTextNode(clean((_b2 = art.querySelector(".eyebrow")) == null ? void 0 : _b2.textContent))),
            hinted(document, "title", document.createTextNode(clean((_c2 = art.querySelector("h3")) == null ? void 0 : _c2.textContent))),
            hinted(document, "description", desc2),
            hinted(document, "link", p)
          ]);
        });
        main.append(document.createElement("hr"));
        main.append(WebImporter.Blocks.createBlock(document, { name: "blog-carousel", cells }));
      }
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_c = document.querySelector('meta[name="description"]')) == null ? void 0 : _c.getAttribute("content")),
        // JSW Motors nav document (pill header); the design has no footer
        nav: clean((_d = document.querySelector('meta[name="nav"]')) == null ? void 0 : _d.getAttribute("content")),
        footer: clean((_e = document.querySelector('meta[name="footer"]')) == null ? void 0 : _e.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/new-energy",
        report: { title: document.title, template: "new-energy", blocks: ["hero-video", "engine-showcase", "parallax-collage", "blog-carousel"] }
      }];
    }
  };
  return __toCommonJS(import_new_energy_exports);
})();
