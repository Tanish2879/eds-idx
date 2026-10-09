/* eslint-disable */
/* global WebImporter */

/**
 * Transformer: MG Select (www.mgselect.co.in) site-wide cleanup.
 * All selectors verified in migration-work/cleaned.html.
 */
const TransformHook = { beforeTransform: 'beforeTransform', afterTransform: 'afterTransform' };

export default function transform(hookName, element, payload) {
  if (hookName === TransformHook.beforeTransform) {
    // Overlays / widgets that live inside footer.experiencefragment (found in cleaned.html):
    // <div class="cookieConsent ...">, <div class="loader ...">, <div class="popUpModal ...">
    // with <div class="newsletter__modal"> / <div class="mg-select__modal modal fade">
    WebImporter.DOMUtils.remove(element, [
      '.cookieConsent',
      '.loader-section',
      '.loader.aem-GridColumn',
      '.popUpModal',
      '.newsletter__modal',
      '.mg-select__modal',
    ]);

    // Scroll indicator dots: <div class="scroller ..."><div class="mg-select__pagination">
    WebImporter.DOMUtils.remove(element, ['.mg-select__pagination', '.scroller.aem-GridColumn']);

    // Floating "Book M9 / Cyberster Couture Edition" buttons (body-level siblings of main)
    WebImporter.DOMUtils.remove(element, ['#sticky-cta-m9-wrapper-v2', '#sticky-cta-cyber-wrapper-v2', '.sticky-cta-button']);

    // Tracking pixel captured by the scraper (metadata.json images.mapping: c.clarity.ms/c.gif)
    WebImporter.DOMUtils.remove(element, ['img[src*="c.clarity.ms"]']);

    // Swiper / carousel navigation and pagination UI (not authorable)
    // product showcase: button.swiper-button-next/prev, div.swiper-pagination
    // dealer carousel: button.mg-swiper-button, div.mg-swiper-pagination, div.cmp-carousel__actions
    // heritage timeline: div.timeline-swiper-pagination-div, div.tabs-arrow
    WebImporter.DOMUtils.remove(element, [
      'button.swiper-button-next',
      'button.swiper-button-prev',
      '.swiper-pagination',
      'button.mg-swiper-button',
      '.mg-swiper-pagination',
      '.cmp-carousel__actions',
      '.timeline-swiper-pagination-div',
      '.tabs-arrow',
    ]);

    // Inline sprite SVG data-URI icons inside CTAs:
    // <a class="cta-section__main ..."><span class="cta-section__label">..</span>
    //   <span class="cta-section__icon ..."><img src="data:image/svg+xml..."></span></a>
    WebImporter.DOMUtils.remove(element, ['.cta-section__icon']);

    // Section 5 (Our Heritage): convert the tab label <li class="cmp-tabs__tab--active">OUR HERITAGE</li>
    // into a paragraph eyebrow placed before <h2 class="timeline-container__title">.
    const doc = element.ownerDocument;
    element.querySelectorAll('.tabs.panelcontainer.mg-select-scroller').forEach((tabsSection) => {
      const tab = tabsSection.querySelector('li.cmp-tabs__tab--active');
      const title = tabsSection.querySelector('h2.timeline-container__title');
      if (tab && title) {
        const eyebrow = doc.createElement('p');
        eyebrow.textContent = tab.textContent.trim();
        title.before(eyebrow);
      }
      // Remove the tab bar (<div class="mg-select-tabs__container"> holding arrows + ol.cmp-tabs__tablist)
      WebImporter.DOMUtils.remove(tabsSection, ['.mg-select-tabs__container']);
    });
  }

  if (hookName === TransformHook.afterTransform) {
    // Global header: <header class="experiencefragment ..."> containing div.header__overlay.position-fixed
    // Global footer: <footer class="experiencefragment ..."> containing footer.mg-select__footer
    WebImporter.DOMUtils.remove(element, [
      'header.experiencefragment',
      '.cmp-experiencefragment--header',
      'div.header__overlay.position-fixed',
      'footer.experiencefragment',
      '.cmp-experiencefragment--footer',
      'footer.mg-select__footer',
    ]);

    // Safe non-authorable elements
    WebImporter.DOMUtils.remove(element, ['iframe', 'link', 'noscript', 'script', 'style']);
  }
}
