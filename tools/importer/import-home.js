/* eslint-disable */
/* global WebImporter */

// PARSER IMPORTS
import heroFullbleedParser from './parsers/hero-fullbleed.js';
import carouselShowcaseParser from './parsers/carousel-showcase.js';
import carouselMarqueeParser from './parsers/carousel-marquee.js';
import carouselDealerParser from './parsers/carousel-dealer.js';
import cardsTimelineParser from './parsers/cards-timeline.js';

// TRANSFORMER IMPORTS
import cleanupTransformer from './transformers/mgselect-cleanup.js';
import sectionsTransformer from './transformers/mgselect-sections.js';
import dmImagesTransformer from './transformers/mgselect-dm-images.js';

// PARSER REGISTRY
const parsers = {
  'hero-fullbleed': heroFullbleedParser,
  'carousel-showcase': carouselShowcaseParser,
  'carousel-marquee': carouselMarqueeParser,
  'carousel-dealer': carouselDealerParser,
  'cards-timeline': cardsTimelineParser,
};

// PAGE TEMPLATE CONFIGURATION - Embedded from page-templates.json
const PAGE_TEMPLATE = {
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

// TRANSFORMER REGISTRY
// Order matters: cleanup -> section breaks/metadata -> DM/Scene7 carrier anchors (afterTransform, after parsers)
const transformers = [
  cleanupTransformer,
  ...(PAGE_TEMPLATE.sections && PAGE_TEMPLATE.sections.length > 1 ? [sectionsTransformer] : []),
  dmImagesTransformer,
];

/**
 * Execute all page transformers for a specific hook
 * @param {string} hookName - 'beforeTransform' or 'afterTransform'
 * @param {Element} element - The DOM element to transform
 * @param {Object} payload - { document, url, html, params }
 */
function executeTransformers(hookName, element, payload) {
  const enhancedPayload = {
    ...payload,
    template: PAGE_TEMPLATE,
  };

  transformers.forEach((transformerFn) => {
    try {
      transformerFn.call(null, hookName, element, enhancedPayload);
    } catch (e) {
      console.error(`Transformer failed at ${hookName}:`, e);
    }
  });
}

/**
 * Find all blocks on the page based on the embedded template configuration
 * @param {Document} document - The DOM document
 * @param {Object} template - The embedded PAGE_TEMPLATE object
 * @returns {Array} Array of block instances found on the page
 */
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
          section: blockDef.section || null,
        });
      });
    });
  });

  console.log(`Found ${pageBlocks.length} block instances on page`);
  return pageBlocks;
}

export default {
  transform: (payload) => {
    const { document, url, params } = payload;

    const main = document.body;

    // 1. Initial cleanup + section break markers
    executeTransformers('beforeTransform', main, payload);

    // 2. Find blocks on page using embedded template
    const pageBlocks = findBlocksOnPage(document, PAGE_TEMPLATE);

    // 3. Parse each block (skip elements already replaced by an earlier parser)
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

    // 4. Final cleanup, section metadata, DM/Scene7 carrier anchors
    executeTransformers('afterTransform', main, payload);

    // 5. WebImporter built-in rules
    const hr = document.createElement('hr');
    main.appendChild(hr);
    WebImporter.rules.createMetadata(main, document);
    WebImporter.rules.transformBackgroundImages(main, document);
    WebImporter.rules.adjustImageUrls(main, url, params.originalURL);

    // 6. Sanitized path; root URL maps to /index
    const rawPath = new URL(params.originalURL).pathname
      .replace(/\/$/, '')
      .replace(/\.html?$/, '');
    const path = WebImporter.FileUtils.sanitizePath(rawPath === '' ? '/index' : rawPath);

    return [{
      element: main,
      path,
      report: {
        title: document.title,
        template: PAGE_TEMPLATE.name,
        blocks: pageBlocks.map((b) => b.name),
      },
    }];
  },
};
