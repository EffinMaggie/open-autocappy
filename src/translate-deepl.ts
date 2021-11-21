/** @format */

import { ONodeQueryUpdater } from './dom-manipulation.js';
import { Alternatives } from './caption-alternatives.js';

class settings {
  private model = {
    translator: new ONodeQueryUpdater(
      'meta[name="translator"]',
      'content',
      'https://api.deepl.com/v2/translate'
    ),
    target: new ONodeQueryUpdater('meta[name="translator-target"]', 'content', ''),
    key: new ONodeQueryUpdater('meta[name="translator-api-key"]', 'content', ''),
    formality: new ONodeQueryUpdater('meta[name="translator-formality"]', 'content', 'default'),
  };

  get translator(): string {
    return this.model.translator.value;
  }

  get target(): string {
    return this.model.target.value;
  }

  get key(): string {
    return this.model.key.value;
  }

  get formality(): string {
    return this.model.formality.value;
  }

  get enabled(): boolean {
    return this.target !== '' && this.key !== '';
  }
}

interface translation {
  detected_source_language: string;
  text: string;
}

interface translations {
  translations: translation[];
}

export namespace Translations {
  export const Settings = new settings();

  export class LanguageString {
    constructor(public readonly lang: string, public readonly text: string) {}
  }

  export const translate = (
    text: string,
    lang: string,
    settings: settings = Translations.Settings
  ): Promise<Iterable<LanguageString>> => {
    const request = new Request(settings.translator, {
      method: 'POST',
      body: new URLSearchParams({
        text: text,
        source_lang: lang.toUpperCase(),
        target_lang: settings.target.toUpperCase(),
        auth_key: settings.key,
      }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return fetch(request)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error, status = $(response.status)`);
        }

        return response.json();
      })
      .then((json: translations) =>
        Array.from(json['translations']).map(
          (translation: translation) =>
            new LanguageString(translation.detected_source_language, translation.text)
        )
      );
  };
}
