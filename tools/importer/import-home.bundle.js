/* eslint-disable */
var CustomImportScript = (() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
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

  // tools/importer/import-home.js
  var import_home_exports = {};
  __export(import_home_exports, {
    default: () => import_home_default
  });

  // tools/importer/parsers/hero-fullbleed.js
  function firstSrcFromSrcset(srcset) {
    if (!srcset) return "";
    return srcset.split(",")[0].trim().split(/\s+/)[0];
  }
  function assetPath(url) {
    return (url || "").split("?")[0].replace(/\/+$/, "").toLowerCase();
  }
  function parse(element, { document }) {
    const picture = element.querySelector("picture");
    const srcImg = element.querySelector("img.hero__banner__dm--img") || element.querySelector("picture img, img");
    let desktopSrc = "";
    if (picture) {
      const sources = [...picture.querySelectorAll("source[srcset]")];
      const minWidth = sources.find((s) => /min-width/i.test(s.getAttribute("media") || ""));
      const chosen = minWidth || sources[sources.length - 1];
      if (chosen) desktopSrc = firstSrcFromSrcset(chosen.getAttribute("srcset"));
    }
    if (!desktopSrc && srcImg) desktopSrc = srcImg.getAttribute("src") || "";
    let image = null;
    if (desktopSrc) {
      image = document.createElement("img");
      image.setAttribute("src", desktopSrc);
      const alt = srcImg && (srcImg.getAttribute("alt") || srcImg.getAttribute("title")) || "";
      image.setAttribute("alt", alt);
    }
    let mobileSrc = "";
    if (picture) {
      const maxWidth = [...picture.querySelectorAll("source[srcset]")].find((s) => /max-width/i.test(s.getAttribute("media") || ""));
      if (maxWidth) mobileSrc = firstSrcFromSrcset(maxWidth.getAttribute("srcset"));
    }
    if (!mobileSrc && srcImg) mobileSrc = srcImg.getAttribute("src") || "";
    if (mobileSrc && (mobileSrc.startsWith("data:") || assetPath(mobileSrc) === assetPath(desktopSrc))) mobileSrc = "";
    let mobileImage = null;
    if (mobileSrc) {
      mobileImage = document.createElement("img");
      mobileImage.setAttribute("src", mobileSrc);
      mobileImage.setAttribute("alt", image && image.getAttribute("alt") || srcImg && (srcImg.getAttribute("alt") || srcImg.getAttribute("title")) || "");
    }
    const headingSrc = element.querySelector(".hero__banner--title h1, .hero__banner--title h2, .hero__banner--title h3, .hero__banner--title h4, .hero__banner--title h5, .hero__banner--title h6") || element.querySelector("h1, h2, h3, h4, h5, h6");
    let heading = null;
    if (headingSrc && headingSrc.textContent.trim()) {
      heading = document.createElement("h1");
      heading.textContent = headingSrc.textContent.trim();
    }
    const ctaEls = [...element.querySelectorAll(".hero__banner__content--cta a[href]")];
    const ctaLinks = (ctaEls.length ? ctaEls : [...element.querySelectorAll("a.cta-section__main[href]")]).map((a) => {
      const label = (a.querySelector(".cta-section__label") || a).textContent.trim() || a.getAttribute("title") || "";
      if (!label) return null;
      const p = document.createElement("p");
      const link = document.createElement("a");
      link.setAttribute("href", a.getAttribute("href"));
      link.textContent = label;
      p.append(link);
      return p;
    }).filter(Boolean);
    if (!image && !heading && !ctaLinks.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const cells = [];
    if (image) {
      const imageFrag = document.createDocumentFragment();
      imageFrag.appendChild(document.createComment(" field:image "));
      imageFrag.appendChild(image);
      cells.push([imageFrag]);
    } else {
      cells.push([""]);
    }
    if (mobileImage) {
      const mobileFrag = document.createDocumentFragment();
      mobileFrag.appendChild(document.createComment(" field:mobileImage "));
      mobileFrag.appendChild(mobileImage);
      cells.push([mobileFrag]);
    } else {
      cells.push([""]);
    }
    const textContent = [];
    if (heading) textContent.push(heading);
    textContent.push(...ctaLinks);
    if (textContent.length) {
      const textFrag = document.createDocumentFragment();
      textFrag.appendChild(document.createComment(" field:text "));
      textContent.forEach((n) => textFrag.appendChild(n));
      cells.push([textFrag]);
    } else {
      cells.push([""]);
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "hero-fullbleed", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/carousel-showcase.js
  function firstSrcFromSrcset2(srcset) {
    if (!srcset) return "";
    return srcset.trim().split(",")[0].trim().split(/\s+/)[0];
  }
  function assetPath2(url) {
    return (url || "").split("?")[0].replace(/\/+$/, "").toLowerCase();
  }
  function buildImage(container, document) {
    if (!container) return null;
    const srcImg = container.querySelector("img");
    const picture = container.querySelector("picture");
    let src = "";
    if (picture) {
      const sources = [...picture.querySelectorAll("source[srcset]")];
      const desktop = sources.find((s) => /min-width/i.test(s.getAttribute("media") || "")) || sources[sources.length - 1];
      if (desktop) src = firstSrcFromSrcset2(desktop.getAttribute("srcset"));
    }
    if (!src && srcImg) src = srcImg.getAttribute("src") || "";
    if (!src) return null;
    const img = document.createElement("img");
    img.setAttribute("src", src);
    img.setAttribute("alt", (srcImg && (srcImg.getAttribute("alt") || srcImg.getAttribute("title")) || "").trim());
    return img;
  }
  function buildMobileImage(container, desktopImg, document) {
    if (!container || !desktopImg) return null;
    const srcImg = container.querySelector("img");
    const picture = container.querySelector("picture");
    let src = "";
    if (picture) {
      const mobile = [...picture.querySelectorAll("source[srcset]")].find((s) => /max-width/i.test(s.getAttribute("media") || ""));
      if (mobile) src = firstSrcFromSrcset2(mobile.getAttribute("srcset"));
    }
    if (!src && srcImg) src = srcImg.getAttribute("src") || "";
    if (!src || src.startsWith("data:") || assetPath2(src) === assetPath2(desktopImg.getAttribute("src"))) return null;
    const img = document.createElement("img");
    img.setAttribute("src", src);
    img.setAttribute("alt", desktopImg.getAttribute("alt") || "");
    return img;
  }
  function groupedImages(document, entries) {
    const frag = document.createDocumentFragment();
    entries.forEach(([field, img]) => {
      if (!img) return;
      frag.appendChild(document.createComment(` field:${field} `));
      frag.appendChild(img);
    });
    return frag.childNodes.length ? frag : "";
  }
  function hinted(document, field, nodes) {
    const frag = document.createDocumentFragment();
    frag.appendChild(document.createComment(` field:${field} `));
    nodes.forEach((n) => frag.appendChild(n));
    return frag;
  }
  function parse2(element, { document }) {
    const slides = [...element.querySelectorAll(".product-showcase__swiper .swiper-wrapper > .swiper-slide")];
    const slideList = slides.length ? slides : [...element.querySelectorAll(".swiper-slide")];
    const contents = [...element.querySelectorAll(".car-models-carousel__content")];
    const count = Math.max(slideList.length, contents.length);
    const cells = [];
    for (let i = 0; i < count; i += 1) {
      const slide = slideList[i];
      const content = contents[i];
      let dayImg = null;
      let nightImg = null;
      let dayMobileImg = null;
      let nightMobileImg = null;
      if (slide) {
        let dayEl = slide.querySelector(".product-showcase__swiper--image-light");
        let nightEl = slide.querySelector(".product-showcase__swiper--image-dark");
        dayImg = buildImage(dayEl, document);
        nightImg = buildImage(nightEl, document);
        if (!dayImg) {
          const pics = [...slide.querySelectorAll("picture")];
          dayEl = pics[0];
          dayImg = buildImage(dayEl, document);
          if (!nightImg && pics[1]) {
            nightEl = pics[1];
            nightImg = buildImage(nightEl, document);
          }
        }
        dayMobileImg = buildMobileImage(dayEl, dayImg, document);
        nightMobileImg = buildMobileImage(nightEl, nightImg, document);
      }
      const textNodes = [];
      if (content) {
        const nameEl = content.querySelector(".car-models-carousel__content-name") || content.querySelector("h1, h2, h3, h4, h5, h6");
        if (nameEl && nameEl.textContent.trim()) {
          const h = document.createElement("h2");
          h.textContent = nameEl.textContent.trim();
          textNodes.push(h);
        }
        const descEl = content.querySelector(".car-models-carousel__content-description") || content.querySelector("p");
        if (descEl && descEl.textContent.trim()) {
          const p = document.createElement("p");
          p.textContent = descEl.textContent.trim();
          textNodes.push(p);
        }
        const seen = /* @__PURE__ */ new Set();
        content.querySelectorAll("a[href]").forEach((a) => {
          const href = a.getAttribute("href");
          if (!href || seen.has(href)) return;
          const label = ((a.querySelector(".cta-section__label") || a).textContent || "").trim() || a.getAttribute("title") || "";
          if (!label) return;
          seen.add(href);
          const p = document.createElement("p");
          const link = document.createElement("a");
          link.setAttribute("href", href);
          link.textContent = label;
          p.append(link);
          textNodes.push(p);
        });
      }
      if (!dayImg && !nightImg && !textNodes.length) continue;
      cells.push([
        groupedImages(document, [["media_image", dayImg], ["media_mobileImage", dayMobileImg]]),
        groupedImages(document, [["night_image", nightImg], ["night_mobileImage", nightMobileImg]]),
        textNodes.length ? hinted(document, "content_text", textNodes) : ""
      ]);
    }
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-showcase", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/carousel-marquee.js
  function pathKey(src) {
    try {
      return new URL(src, "https://x/").pathname;
    } catch (e) {
      return (src || "").split("?")[0];
    }
  }
  function leadingNumber(path) {
    const m = path.split("/").pop().match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }
  function parse3(element, { document }) {
    let imgs = [...element.querySelectorAll(".swiper-slide picture img")];
    if (!imgs.length) imgs = [...element.querySelectorAll(".swiper-slide img, picture img")];
    const seen = /* @__PURE__ */ new Set();
    let items = [];
    imgs.forEach((srcImg) => {
      const src = srcImg.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      const key = pathKey(src);
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ src, alt: (srcImg.getAttribute("alt") || srcImg.getAttribute("title") || "").trim(), order: leadingNumber(key) });
    });
    if (items.length && items.every((it) => it.order !== null)) {
      items = items.sort((a, b) => a.order - b.order);
    }
    if (!items.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const cells = items.map(({ src, alt }) => {
      const img = document.createElement("img");
      img.setAttribute("src", src);
      img.setAttribute("alt", alt);
      const frag = document.createDocumentFragment();
      frag.appendChild(document.createComment(" field:media_image "));
      frag.appendChild(img);
      return [frag, ""];
    });
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-marquee", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/carousel-dealer.js
  function firstSrcFromSrcset3(srcset) {
    if (!srcset) return "";
    return srcset.trim().split(",")[0].trim().split(/\s+/)[0];
  }
  function assetPath3(url) {
    return (url || "").split("?")[0].replace(/\/+$/, "").toLowerCase();
  }
  function titleCase(str) {
    return (str || "").trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  function cityFromHref(href) {
    const slug = (href || "").split("?")[0].split("/").filter(Boolean).pop() || "";
    return titleCase(slug.split("-")[0] || "");
  }
  function parse4(element, { document }) {
    let slides = [...element.querySelectorAll(".mg-swiper-slide")];
    if (!slides.length) slides = [...element.querySelectorAll('.swiper-slide, [role="tabpanel"]')];
    const cells = [];
    slides.forEach((slide) => {
      const container = slide.querySelector(".hero__banner__dm__img--container") || slide;
      const anchor = container.querySelector("a[href]");
      const srcImg = container.querySelector("img.hero__banner__dm--img") || container.querySelector("picture img");
      const picture = anchor && anchor.querySelector("picture") || container.querySelector("picture");
      let src = "";
      if (picture) {
        const sources = [...picture.querySelectorAll("source[srcset]")];
        const desktop = sources.find((s) => /min-width/i.test(s.getAttribute("media") || "")) || sources[sources.length - 1];
        if (desktop) src = firstSrcFromSrcset3(desktop.getAttribute("srcset"));
      }
      if (!src && srcImg) {
        src = (srcImg.getAttribute("src") || "").replace(/1080-X-1920/i, "1920-x-1080");
      }
      let mobileSrc = "";
      if (picture) {
        const mobile = [...picture.querySelectorAll("source[srcset]")].find((s) => /max-width/i.test(s.getAttribute("media") || ""));
        if (mobile) mobileSrc = firstSrcFromSrcset3(mobile.getAttribute("srcset"));
      }
      if (!mobileSrc && srcImg) mobileSrc = srcImg.getAttribute("src") || "";
      if (mobileSrc && (mobileSrc.startsWith("data:") || /dealer-carousel-bg/i.test(mobileSrc) || assetPath3(mobileSrc) === assetPath3(src))) mobileSrc = "";
      const href = anchor ? anchor.getAttribute("href") : "";
      const rawAlt = (srcImg && (srcImg.getAttribute("alt") || srcImg.getAttribute("title")) || anchor && anchor.getAttribute("aria-label") || "").trim();
      const city = rawAlt ? titleCase(rawAlt) : cityFromHref(href);
      if (!src && !href) return;
      let imageCell = "";
      if (src) {
        const img = document.createElement("img");
        img.setAttribute("src", src);
        img.setAttribute("alt", city ? `${city} Experience Centre` : "");
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createComment(" field:media_image "));
        frag.appendChild(img);
        if (mobileSrc) {
          const mobileImg = document.createElement("img");
          mobileImg.setAttribute("src", mobileSrc);
          mobileImg.setAttribute("alt", img.getAttribute("alt"));
          frag.appendChild(document.createComment(" field:media_mobileImage "));
          frag.appendChild(mobileImg);
        }
        imageCell = frag;
      }
      let linkCell = "";
      if (href) {
        const link = document.createElement("a");
        link.setAttribute("href", href);
        link.textContent = city ? `${city} Experience Centre - Know more` : "Know more";
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createComment(" field:link "));
        frag.appendChild(link);
        linkCell = frag;
      }
      cells.push([imageCell, linkCell]);
    });
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "carousel-dealer", cells });
    element.replaceWith(block);
  }

  // tools/importer/parsers/cards-timeline.js
  function clean(text) {
    return (text || "").replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ").trim();
  }
  function parse5(element, { document }) {
    let cards = [...element.querySelectorAll(".timeline-card")];
    if (!cards.length) {
      cards = [...element.querySelectorAll(".model-year")].map((y) => y.closest(".swiper-slide") || y.parentElement);
    }
    if (cards.length && cards.every((c) => c.hasAttribute("data-swiper-slide-index"))) {
      cards = cards.map((c, i) => ({ c, i, k: parseInt(c.getAttribute("data-swiper-slide-index"), 10) })).sort((a, b) => a.k - b.k || a.i - b.i).map(({ c }) => c);
    }
    const cells = [];
    cards.forEach((card) => {
      var _a;
      const year = clean(((_a = card.querySelector(".model-year")) == null ? void 0 : _a.textContent) || card.getAttribute("data-year"));
      const overlay = card.querySelector(".overlay");
      const tooltip = (overlay == null ? void 0 : overlay.querySelector(".timeline-card-tooltip")) || card.querySelector(".timeline-card-tooltip, .tooltip");
      let title = "";
      if (overlay) {
        title = clean([...overlay.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" "));
        title = title.replace(/^[+−-]\s*/, "");
      }
      const srcImg = card.querySelector(".timeline-card__picture img") || card.querySelector("picture img, img");
      if (!title && srcImg) title = clean(srcImg.getAttribute("title") || srcImg.getAttribute("alt"));
      const description = clean(tooltip == null ? void 0 : tooltip.textContent);
      let imageCell = "";
      const src = srcImg ? srcImg.getAttribute("src") : "";
      if (src) {
        const img = document.createElement("img");
        img.setAttribute("src", src);
        img.setAttribute("alt", clean(srcImg.getAttribute("alt") || srcImg.getAttribute("title")));
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createComment(" field:image "));
        frag.appendChild(img);
        imageCell = frag;
      }
      const textNodes = [];
      if (year) {
        const p = document.createElement("p");
        p.textContent = year;
        textNodes.push(p);
      }
      if (title) {
        const h = document.createElement("h3");
        h.textContent = title;
        textNodes.push(h);
      }
      if (description) {
        const p = document.createElement("p");
        p.textContent = description;
        textNodes.push(p);
      }
      let textCell = "";
      if (textNodes.length) {
        const frag = document.createDocumentFragment();
        frag.appendChild(document.createComment(" field:text "));
        textNodes.forEach((n) => frag.appendChild(n));
        textCell = frag;
      }
      if (!imageCell && !textCell) return;
      cells.push([imageCell, textCell]);
    });
    if (!cells.length) {
      element.replaceWith(...element.childNodes);
      return;
    }
    const block = WebImporter.Blocks.createBlock(document, { name: "cards-timeline", cells });
    element.replaceWith(block);
  }

  // tools/importer/transformers/mgselect-cleanup.js
  var TransformHook = { beforeTransform: "beforeTransform", afterTransform: "afterTransform" };
  function transform(hookName, element, payload) {
    if (hookName === TransformHook.beforeTransform) {
      WebImporter.DOMUtils.remove(element, [
        ".cookieConsent",
        ".loader-section",
        ".loader.aem-GridColumn",
        ".popUpModal",
        ".newsletter__modal",
        ".mg-select__modal"
      ]);
      WebImporter.DOMUtils.remove(element, [".mg-select__pagination", ".scroller.aem-GridColumn"]);
      WebImporter.DOMUtils.remove(element, ["#sticky-cta-m9-wrapper-v2", "#sticky-cta-cyber-wrapper-v2", ".sticky-cta-button"]);
      WebImporter.DOMUtils.remove(element, ['img[src*="c.clarity.ms"]']);
      WebImporter.DOMUtils.remove(element, [
        "button.swiper-button-next",
        "button.swiper-button-prev",
        ".swiper-pagination",
        "button.mg-swiper-button",
        ".mg-swiper-pagination",
        ".cmp-carousel__actions",
        ".timeline-swiper-pagination-div",
        ".tabs-arrow"
      ]);
      WebImporter.DOMUtils.remove(element, [".cta-section__icon"]);
      const doc = element.ownerDocument;
      element.querySelectorAll(".tabs.panelcontainer.mg-select-scroller").forEach((tabsSection) => {
        const tab = tabsSection.querySelector("li.cmp-tabs__tab--active");
        const title = tabsSection.querySelector("h2.timeline-container__title");
        if (tab && title) {
          const eyebrow = doc.createElement("p");
          eyebrow.textContent = tab.textContent.trim();
          title.before(eyebrow);
        }
        WebImporter.DOMUtils.remove(tabsSection, [".mg-select-tabs__container"]);
      });
    }
    if (hookName === TransformHook.afterTransform) {
      WebImporter.DOMUtils.remove(element, [
        "header.experiencefragment",
        ".cmp-experiencefragment--header",
        "div.header__overlay.position-fixed",
        "footer.experiencefragment",
        ".cmp-experiencefragment--footer",
        "footer.mg-select__footer"
      ]);
      WebImporter.DOMUtils.remove(element, ["iframe", "link", "noscript", "script", "style"]);
    }
  }

  // tools/importer/transformers/mgselect-sections.js
  var SECTION_MARKER_ATTR = "data-excat-section-id";
  function querySection(root, selectors) {
    const list = Array.isArray(selectors) ? selectors : [selectors];
    for (const sel of list) {
      if (!sel) continue;
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }
  function transform2(hookName, element, payload) {
    const sections = payload && payload.template && payload.template.sections || [];
    const doc = element.ownerDocument;
    if (hookName === "beforeTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (i === 0 && !section.style) continue;
        const sectionEl = querySection(element, section.selector);
        if (!sectionEl) continue;
        const hr = doc.createElement("hr");
        if (section.style) hr.setAttribute(SECTION_MARKER_ATTR, section.id);
        sectionEl.before(hr);
      }
    }
    if (hookName === "afterTransform") {
      for (let i = sections.length - 1; i >= 0; i -= 1) {
        const section = sections[i];
        if (!section.style) continue;
        const marker = element.querySelector(`[${SECTION_MARKER_ATTR}="${section.id}"]`);
        const anchor = marker || querySection(element, section.selector);
        if (!anchor) continue;
        const metadataBlock = WebImporter.Blocks.createBlock(doc, {
          name: "Section Metadata",
          cells: { style: section.style }
        });
        anchor.after(metadataBlock);
        if (marker) {
          marker.removeAttribute(SECTION_MARKER_ATTR);
          if (i === 0) marker.remove();
        }
      }
    }
  }

  // tools/importer/transformers/mgselect-dm-images.js
  function detectDynamicMediaUrl(urlStr) {
    let u;
    try {
      u = new URL(urlStr, "https://x/");
    } catch (e) {
      return false;
    }
    if (u.pathname.startsWith("/is/image/")) {
      return "scene7";
    }
    if (/^delivery-p\d+-e\d+\.adobeaemcloud\.com$/.test(u.hostname) && u.pathname.startsWith("/adobe/assets/urn:")) {
      return "dm-openapi";
    }
    return false;
  }
  var LINKED_DM_INLINE_WRAPPER_TAGS = /* @__PURE__ */ new Set(["PICTURE"]);
  var LINKED_DM_WRAPPER_SIBLING_TAGS = /* @__PURE__ */ new Set(["SOURCE"]);
  function findLinkedDmCarrier(img) {
    if (!img || !img.parentElement) return null;
    let node = img;
    let parent = img.parentElement;
    while (parent && LINKED_DM_INLINE_WRAPPER_TAGS.has(parent.tagName)) {
      let foundNode = false;
      for (const child of parent.children) {
        if (child === node) {
          foundNode = true;
        } else if (!LINKED_DM_WRAPPER_SIBLING_TAGS.has(child.tagName)) {
          return null;
        }
      }
      if (!foundNode) return null;
      node = parent;
      parent = parent.parentElement;
    }
    if (!parent || parent.tagName !== "A") return null;
    if (parent.children.length !== 1 || parent.children[0] !== node) return null;
    if (parent.textContent.trim() !== "") return null;
    return parent;
  }
  var EMPTY_ALT_SENTINEL = "Image without alt text";
  function altToLinkText(alt) {
    return alt || EMPTY_ALT_SENTINEL;
  }
  function transform3(hookName, element, payload) {
    if (hookName !== "afterTransform") return;
    const doc = element.ownerDocument;
    element.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (!detectDynamicMediaUrl(src)) return;
      const alt = img.getAttribute("alt") || "";
      const linkedAnchor = findLinkedDmCarrier(img);
      if (linkedAnchor) {
        linkedAnchor.setAttribute("title", src);
        linkedAnchor.textContent = altToLinkText(alt);
        return;
      }
      const parent = img.parentElement;
      if (parent && parent.tagName === "A") {
        console.warn("DM image inside mixed-content anchor, skipped:", src);
        return;
      }
      const a = doc.createElement("a");
      a.href = src;
      a.textContent = altToLinkText(alt);
      img.replaceWith(a);
    });
  }

  // tools/importer/import-home.js
  var parsers = {
    "hero-fullbleed": parse,
    "carousel-showcase": parse2,
    "carousel-marquee": parse3,
    "carousel-dealer": parse4,
    "cards-timeline": parse5
  };
  var PAGE_TEMPLATE = {
    "name": "home",
    "description": "MG Select homepage: full-screen hero, product showcase carousel, brand manifesto with image marquee, dealer experience-centre carousel, and heritage timeline",
    "urls": [
      "https://www.mgselect.co.in/"
    ],
    "blocks": [
      {
        "name": "hero-fullbleed",
        "instances": [
          ".banner.mg-select-scroller > section.hero__banner--wrapper"
        ]
      },
      {
        "name": "carousel-showcase",
        "instances": [
          ".productShowcase.mg-select-scroller > section.product-showcase"
        ]
      },
      {
        "name": "carousel-marquee",
        "instances": [
          ".brandManifesto .brand-manifesto__gallery"
        ]
      },
      {
        "name": "carousel-dealer",
        "instances": [
          ".carousel.panelcontainer.mg-select-scroller .mg-carousel"
        ]
      },
      {
        "name": "cards-timeline",
        "instances": [
          ".tabs.panelcontainer.mg-select-scroller .timeline-swiper-container"
        ]
      }
    ],
    "sections": [
      {
        "id": "section-1",
        "name": "Hero banner",
        "selector": [
          ".banner.mg-select-scroller.light-header"
        ],
        "style": null,
        "blocks": [
          "hero-fullbleed"
        ],
        "defaultContent": []
      },
      {
        "id": "section-2",
        "name": "Product showcase",
        "selector": [
          ".productShowcase.mg-select-scroller"
        ],
        "style": null,
        "blocks": [
          "carousel-showcase"
        ],
        "defaultContent": []
      },
      {
        "id": "section-3",
        "name": "Brand manifesto",
        "selector": [
          ".brandManifesto.mg-select-scroller"
        ],
        "style": "manifesto",
        "blocks": [
          "carousel-marquee"
        ],
        "defaultContent": [
          ".brand-manifesto__greeting > p",
          ".brand-manifesto__logo img",
          ".brand-manifesto__title",
          ".brand-manifesto__text > p",
          ".brand-manifesto__desc > p"
        ]
      },
      {
        "id": "section-4",
        "name": "Dealer experience centres",
        "selector": [
          ".carousel.panelcontainer.mg-select-scroller"
        ],
        "style": null,
        "blocks": [
          "carousel-dealer"
        ],
        "defaultContent": []
      },
      {
        "id": "section-5",
        "name": "Our Heritage timeline",
        "selector": [
          ".tabs.panelcontainer.mg-select-scroller"
        ],
        "style": null,
        "blocks": [
          "cards-timeline"
        ],
        "defaultContent": [
          ".cmp-tabs__tab--active",
          ".timeline-container__title"
        ]
      }
    ]
  };
  var transformers = [
    transform,
    ...PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [transform2] : [],
    transform3
  ];
  function executeTransformers(hookName, element, payload) {
    const enhancedPayload = __spreadProps(__spreadValues({}, payload), {
      template: PAGE_TEMPLATE
    });
    transformers.forEach((transformerFn) => {
      try {
        transformerFn.call(null, hookName, element, enhancedPayload);
      } catch (e) {
        console.error(`Transformer failed at ${hookName}:`, e);
      }
    });
  }
  function findBlocksOnPage(document, template) {
    const pageBlocks = [];
    template.blocks.forEach((blockDef) => {
      blockDef.instances.forEach((selector) => {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) {
          console.warn(`Block "${blockDef.name}" selector not found: ${selector}`);
        }
        elements.forEach((element) => {
          pageBlocks.push({
            name: blockDef.name,
            selector,
            element,
            section: blockDef.section || null
          });
        });
      });
    });
    console.log(`Found ${pageBlocks.length} block instances on page`);
    return pageBlocks;
  }
  var import_home_default = {
    transform: (payload) => {
      const { document, url, params } = payload;
      const main = document.body;
      executeTransformers("beforeTransform", main, payload);
      const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);
      pageBlocks.forEach((block) => {
        if (!block.element.parentNode) return;
        const parser = parsers[block.name];
        if (parser) {
          try {
            parser(block.element, { document, url, params });
          } catch (e) {
            console.error(`Failed to parse ${block.name} (${block.selector}):`, e);
          }
        } else {
          console.warn(`No parser found for block: ${block.name}`);
        }
      });
      executeTransformers("afterTransform", main, payload);
      const hr = document.createElement("hr");
      main.appendChild(hr);
      WebImporter.rules.createMetadata(main, document);
      WebImporter.rules.transformBackgroundImages(main, document);
      WebImporter.rules.adjustImageUrls(main, url, params.originalURL);
      const rawPath = new URL(params.originalURL).pathname.replace(/\/$/, "").replace(/\.html?$/, "");
      const path = WebImporter.FileUtils.sanitizePath(rawPath === "" ? "/index" : rawPath);
      return [{
        element: main,
        path,
        report: {
          title: document.title,
          template: PAGE_TEMPLATE.name,
          blocks: pageBlocks.map((b) => b.name)
        }
      }];
    }
  };
  return __toCommonJS(import_home_exports);
})();
