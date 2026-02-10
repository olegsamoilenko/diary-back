export enum ReferrerProvider {
  GOOGLE_PLAY_INSTALL_REFERRER = 'google_play_install_referrer',
}

export type AcquisitionMetaJson = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;

  referrer_raw?: string;
  referrer_provider?: ReferrerProvider;

  [key: string]: any;
};
