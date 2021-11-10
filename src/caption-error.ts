/** @format */

function assertDefined(template: HTMLElement | null): asserts template {
  console.assert(template, 'template for <caption-error> must be defined');
}

function assertIsTemplate(template: HTMLElement): asserts template is HTMLTemplateElement {
  console.assert(
    template.tagName.toLowerCase() === 'template',
    `id="caption-error" must be a <template> and is <${template.tagName}>`
  );
}

export class CaptionError extends HTMLElement {
  static readonly template = () => document.getElementById('caption-error');

  constructor() {
    super();

    const template = CaptionError.template();
    assertDefined(template);
    assertIsTemplate(template);

    const shadow = this.attachShadow({ mode: 'open' }).appendChild(template.content.cloneNode(true));
  }
}

customElements.define('caption-error', CaptionError);
