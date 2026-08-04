import { navigation as ukNavigation } from "./uk/navigation.js";
import { privacyPolicy as ukPrivacyPolicy } from "./uk/privacy-policy.js";
import { landing as ukLanding } from "./uk/landing.js";
import { vocabulary as ukVocabulary } from "./uk/vocabulary.js";

export const DEFAULT_LOCALE = "uk";

const contentByLocale = Object.freeze({
    uk: Object.freeze({ navigation: ukNavigation, privacyPolicy: ukPrivacyPolicy, landing: ukLanding, vocabulary: ukVocabulary }),
});

/**
 * Content is deliberately resolved at the edge. There is no user locale
 * preference yet, so Ukrainian remains the current product default.
 */
export function contentFor(locale = DEFAULT_LOCALE) {
    return contentByLocale[locale] ?? contentByLocale[DEFAULT_LOCALE];
}
