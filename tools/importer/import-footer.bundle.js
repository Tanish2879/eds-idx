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

  // tools/importer/import-footer.js
  var import_footer_exports = {};
  __export(import_footer_exports, {
    default: () => import_footer_default
  });
  var ORIGIN = "https://www.mgselect.co.in";
  function clean(text) {
    return (text || "").replace(/[​\s]+/g, " ").trim();
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
  function bold(doc, text) {
    return el(doc, "p", {}, [el(doc, "strong", {}, [text])]);
  }
  function linkList(doc, anchors, labelFn) {
    const ul = doc.createElement("ul");
    anchors.forEach((a) => {
      const href = relHref(a.getAttribute("href"));
      const label = labelFn ? labelFn(a) : clean(a.textContent);
      if (href && label) ul.append(el(doc, "li", {}, [el(doc, "a", { href }, [label])]));
    });
    return ul;
  }
  function networkName(a) {
    const host = new URL(a.getAttribute("href"), ORIGIN).hostname.replace(/^www\./, "");
    const known = { "instagram.com": "Instagram", "x.com": "X", "twitter.com": "X", "linkedin.com": "LinkedIn", "facebook.com": "Facebook", "youtube.com": "YouTube" };
    return clean(a.getAttribute("aria-label")) || known[host] || host.split(".")[0];
  }
  function buildFooter(document) {
    const footer = document.querySelector("footer.mg-select__footer");
    const sections = [];
    const brand = document.createElement("div");
    const logoLink = footer.querySelector(".footer__logo a");
    const logo = logoLink && logoLink.querySelector("img");
    if (logo) {
      brand.append(el(document, "p", {}, [el(document, "a", { href: relHref(logoLink.getAttribute("href")) || "/" }, [
        el(document, "img", { src: logo.getAttribute("src"), alt: clean(logo.getAttribute("alt")) || "MG Select" })
      ])]));
    }
    sections.push(brand);
    const form = footer.querySelector("form.newsletter__form");
    if (form) {
      const sec = document.createElement("div");
      const heading = form.querySelector(".newsletter__form--heading");
      if (heading) sec.append(bold(document, clean(heading.textContent)));
      const email = form.querySelector('input[type="email"], input.newsletter__form-input:not([type="checkbox"])');
      if (email && email.getAttribute("placeholder")) sec.append(el(document, "p", {}, [clean(email.getAttribute("placeholder"))]));
      const submit = form.querySelector(".newsletter__form-submit");
      const submitLabel = clean(submit && submit.textContent) || "SIGN UP";
      sec.append(el(document, "p", {}, [submitLabel]));
      const label = form.querySelector(".newsletter__form-label");
      if (label) {
        const p = document.createElement("p");
        const added = /* @__PURE__ */ new Set();
        const walker = document.createTreeWalker(label, 4);
        let n = walker.nextNode();
        while (n) {
          const text = clean(n.textContent);
          const a = n.parentElement && n.parentElement.closest("a[href]");
          if (a && label.contains(a)) {
            if (!added.has(a)) {
              added.add(a);
              p.append(el(document, "a", { href: relHref(a.getAttribute("href")) }, [clean(a.textContent)]));
            }
          } else if (text) {
            p.append(document.createTextNode(`${text} `));
          }
          n = walker.nextNode();
        }
        sec.append(p);
      }
      sections.push(sec);
    }
    const cols = document.createElement("div");
    footer.querySelectorAll(".footer__navigation--content").forEach((list) => {
      const col = list.parentElement;
      const title = col.querySelector(":scope > div:first-child");
      if (title) cols.append(bold(document, clean(title.textContent)));
      cols.append(linkList(document, [...list.querySelectorAll("a[href]")]));
    });
    sections.push(cols);
    const legal = document.createElement("div");
    const legalWrap = footer.querySelector(".footer__legal");
    if (legalWrap) {
      const copy = legalWrap.querySelector(":scope > div");
      if (copy) legal.append(el(document, "p", {}, [clean(copy.textContent)]));
      legal.append(linkList(document, [...legalWrap.querySelectorAll(":scope > a[href]")]));
    }
    sections.push(legal);
    const social = document.createElement("div");
    social.append(linkList(document, [...footer.querySelectorAll(".footer__social a[href]")], networkName));
    sections.push(social);
    return sections;
  }
  var import_footer_default = {
    transform: (payload) => {
      const { document } = payload;
      const sections = buildFooter(document);
      const main = document.createElement("main");
      sections.forEach((s, i) => {
        if (i > 0) main.append(document.createElement("hr"));
        main.append(s);
      });
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/footer",
        report: { title: "footer", sections: sections.length }
      }];
    }
  };
  return __toCommonJS(import_footer_exports);
})();
