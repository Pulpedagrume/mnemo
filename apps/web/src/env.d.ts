/** Build-time settings of the web app (all optional). */
interface ImportMetaEnv {
  /** Publisher shown in the legal notice (a name or a pseudonym). */
  readonly VITE_LEGAL_PUBLISHER?: string;
  /** How to contact the publisher (URL or e-mail address). */
  readonly VITE_LEGAL_CONTACT?: string;
  /** Host name and postal address (required by French law for a public site). */
  readonly VITE_LEGAL_HOST?: string;
  /** URL of the host's privacy policy. */
  readonly VITE_LEGAL_HOST_PRIVACY?: string;
  /** URL of the source code of this copy. */
  readonly VITE_SOURCE_URL?: string;
}
