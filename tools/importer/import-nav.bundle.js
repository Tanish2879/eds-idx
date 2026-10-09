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

  // tools/importer/import-nav.js
  var import_nav_exports = {};
  __export(import_nav_exports, {
    default: () => import_nav_default
  });
  var ORIGIN = "https://www.mgselect.co.in";
  function clean(text) {
    return (text || "").replace(/[​\s]+/g, " ").trim();
  }
  function absImg(src) {
    if (!src) return "";
    return src.startsWith("//") ? `https:${src}` : src;
  }
  function relHref(href) {
    if (!href) return "";
    return href.startsWith(ORIGIN) ? href.slice(ORIGIN.length) || "/" : href;
  }
  function el(doc, tag, attrs = {}, children = []) {
    const e = doc.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v) e.setAttribute(k, v);
    });
    children.forEach((c) => e.append(typeof c === "string" ? doc.createTextNode(c) : c));
    return e;
  }
  function img(doc, source) {
    return el(doc, "img", { src: absImg(source.getAttribute("src")), alt: clean(source.getAttribute("alt")) });
  }
  function linkList(doc, anchors) {
    const ul = doc.createElement("ul");
    const seen = /* @__PURE__ */ new Set();
    anchors.forEach((a) => {
      const label = clean(a.textContent);
      const href = relHref(a.getAttribute("href"));
      if (!label || !href || seen.has(`${label}|${href}`)) return;
      seen.add(`${label}|${href}`);
      ul.append(el(doc, "li", {}, [el(doc, "a", { href }, [label])]));
    });
    return ul;
  }
  function buildNav(document) {
    const header = document.querySelector(".header-section");
    const sections = [];
    const brand = document.createElement("div");
    header.querySelectorAll(".header__overlay a.header__logo--main").forEach((a) => {
      const i = a.querySelector("img");
      if (i) brand.append(el(document, "p", {}, [el(document, "a", { href: relHref(a.getAttribute("href")) || "/" }, [img(document, i)])]));
    });
    sections.push(brand);
    const tools = document.createElement("div");
    const utilArea = header.querySelector(".header__user__info");
    const util = utilArea && [...utilArea.querySelectorAll("a[href]")].find((a) => clean(a.textContent));
    if (util) {
      const icon = utilArea.querySelector("img");
      const children = icon ? [img(document, icon), ` ${clean(util.textContent)}`] : [clean(util.textContent)];
      tools.append(el(document, "p", {}, [el(document, "a", { href: relHref(util.getAttribute("href")) }, children)]));
    }
    sections.push(tools);
    const tabLabels = [...header.querySelectorAll(".header__main--tabs .header__main--tab")].map((t) => clean(t.textContent));
    const pages = header.querySelectorAll(".header__main .header-new-section__page");
    tabLabels.forEach((label, ti) => {
      const pg = pages[ti];
      if (!pg) return;
      const sec = document.createElement("div");
      sec.append(el(document, "p", {}, [el(document, "strong", {}, [label])]));
      const items = [...pg.querySelectorAll(".header__main--left .header__accordion--menu > li")];
      const panes = [...pg.querySelectorAll(".header__main--right > .header__main--content")];
      let paneIdx = 0;
      items.forEach((li) => {
        const title = li.querySelector("h3, h4, [class*=title]");
        const titleText = clean((title || li).childNodes.length ? (title || li).textContent : "");
        const subtitle = li.querySelector("p");
        const directLink = li.querySelector("a[href]");
        if (directLink && !li.getAttribute("aria-controls")) {
          sec.append(el(document, "p", {}, [el(document, "strong", {}, [el(document, "a", { href: relHref(directLink.getAttribute("href")) }, [clean(directLink.textContent) || titleText])])]));
          return;
        }
        const name = clean(title ? title.textContent : li.textContent.replace(subtitle ? subtitle.textContent : "", ""));
        sec.append(el(document, "p", {}, [el(document, "strong", {}, [name])]));
        if (subtitle && clean(subtitle.textContent)) sec.append(el(document, "p", {}, [clean(subtitle.textContent)]));
        const pane = panes[paneIdx];
        paneIdx += 1;
        if (!pane) return;
        const desc = [...pane.querySelectorAll("p")].map((p) => clean(p.textContent)).filter((t) => t && !/^ex-showroom/i.test(t));
        desc.slice(0, 1).forEach((t) => sec.append(el(document, "p", {}, [t])));
        const pic = pane.querySelector("img");
        if (pic) sec.append(el(document, "p", {}, [img(document, pic)]));
        const anchors = [...pane.querySelectorAll("a[href]")].filter((a) => clean(a.textContent));
        if (anchors.length) sec.append(linkList(document, anchors));
      });
      sections.push(sec);
    });
    const sticky = [...document.querySelectorAll("a.sticky-cta-button")];
    if (sticky.length) {
      const sec = document.createElement("div");
      sec.append(linkList(document, sticky));
      sections.push(sec);
    }
    return sections;
  }
  var import_nav_default = {
    transform: (payload) => {
      const { document } = payload;
      const sections = buildNav(document);
      const main = document.createElement("main");
      sections.forEach((s, i) => {
        if (i > 0) main.append(document.createElement("hr"));
        main.append(s);
      });
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/nav",
        report: { title: "nav", sections: sections.length }
      }];
    }
  };
  return __toCommonJS(import_nav_exports);
})();
