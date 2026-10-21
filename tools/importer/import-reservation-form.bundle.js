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

  // tools/importer/import-reservation-form.js
  var import_reservation_form_exports = {};
  __export(import_reservation_form_exports, {
    default: () => import_reservation_form_default
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
  function para(document, text) {
    const p = document.createElement("p");
    p.textContent = text;
    return p;
  }
  function textCell(document, field, value) {
    return value ? hinted(document, field, para(document, value)) : hinted(document, field);
  }
  function idCell(document, id) {
    const cell = document.createElement("div");
    cell.textContent = id;
    return cell;
  }
  var import_reservation_form_default = {
    transform: (payload) => {
      var _a, _b, _c;
      const { document } = payload;
      const src = document.querySelector(".reservation-form-source");
      const main = document.createElement("main");
      const value = (sel) => {
        var _a2;
        return clean((_a2 = src.querySelector(sel)) == null ? void 0 : _a2.textContent);
      };
      const cells = [];
      const source = src.querySelector("img.image");
      const img = document.createElement("img");
      img.src = rootRelative(source.getAttribute("src"));
      img.alt = clean(source.getAttribute("alt"));
      cells.push([hinted(document, "image", img)]);
      cells.push([textCell(document, "heading", value("h1"))]);
      cells.push([textCell(document, "description", value(".description"))]);
      cells.push([textCell(document, "submitLabel", value(".submit"))]);
      cells.push([textCell(document, "submitAction", value(".action"))]);
      cells.push([textCell(document, "successMessage", value(".success"))]);
      cells.push([textCell(document, "disclaimer", value(".disclaimer"))]);
      const mail = src.querySelector("a.email");
      if (mail) {
        const a = document.createElement("a");
        a.href = mail.getAttribute("href");
        a.textContent = clean(mail.textContent);
        const p = document.createElement("p");
        p.append(a);
        cells.push([hinted(document, "privacyEmail", p)]);
      } else cells.push([hinted(document, "privacyEmail")]);
      const privacy = src.querySelector("a.privacy");
      if (privacy) {
        const a = document.createElement("a");
        a.href = rootRelative(privacy.getAttribute("href"));
        a.textContent = clean(privacy.textContent);
        const p = document.createElement("p");
        p.append(a);
        cells.push([hinted(document, "privacyLink", p)]);
      } else cells.push([hinted(document, "privacyLink")]);
      src.querySelectorAll(".item").forEach((item) => {
        if (item.classList.contains("section")) {
          cells.push([idCell(document, "reservation-form-section"), textCell(document, "title", clean(item.textContent))]);
          return;
        }
        const options = [...item.querySelectorAll("li")].map((li) => clean(li.textContent)).join(", ");
        const label = clean([...item.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" "));
        cells.push([
          idCell(document, "reservation-form-field"),
          textCell(document, "label", label),
          textCell(document, "fieldName", item.dataset.name || ""),
          textCell(document, "control", item.dataset.type || "text"),
          textCell(document, "required", item.dataset.required === "true" ? "true" : "false"),
          textCell(document, "width", item.dataset.width || "full"),
          textCell(document, "prefix", item.dataset.prefix || ""),
          textCell(document, "options", options)
        ]);
      });
      main.append(WebImporter.Blocks.createBlock(document, { name: "reservation-form", cells }));
      main.append(WebImporter.Blocks.getMetadataBlock(document, {
        Title: clean(document.title),
        Description: clean((_a = document.querySelector('meta[name="description"]')) == null ? void 0 : _a.getAttribute("content")),
        // the design has no header and no footer
        nav: clean((_b = document.querySelector('meta[name="nav"]')) == null ? void 0 : _b.getAttribute("content")),
        footer: clean((_c = document.querySelector('meta[name="footer"]')) == null ? void 0 : _c.getAttribute("content"))
      }));
      document.body.innerHTML = "";
      document.body.append(main);
      return [{
        element: document.body,
        path: "/reservation-form",
        report: { title: document.title, template: "reservation-form", blocks: ["reservation-form"] }
      }];
    }
  };
  return __toCommonJS(import_reservation_form_exports);
})();
