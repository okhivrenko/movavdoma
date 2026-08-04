(() => {
    "use strict";

    const consentKey = "movayakvdoma_analytics_consent";
    const banner = document.querySelector("[data-consent-banner]");
    const acceptButton = document.querySelector("[data-consent-accept]");
    const rejectButton = document.querySelector("[data-consent-reject]");
    const settingsButtons = document.querySelectorAll("[data-consent-settings]");
    let consentTrigger = null;
    let currentConsent = null;

    function readConsent() {
        try {
            return window.localStorage.getItem(consentKey);
        } catch {
            return null;
        }
    }

    function saveConsent(value) {
        currentConsent = value;
        try {
            window.localStorage.setItem(consentKey, value);
        } catch {
            // The current choice still applies for this page when storage is unavailable.
        }
    }

    function hideBanner() {
        banner.hidden = true;
        consentTrigger?.focus();
        consentTrigger = null;
    }

    function showBanner(trigger = null) {
        consentTrigger = trigger;
        banner.hidden = false;
        acceptButton.focus();
    }

    function removeAnalyticsCookies() {
        const hostname = window.location.hostname;
        document.cookie.split(";").forEach((cookie) => {
            const name = cookie.split("=")[0].trim();
            if (name === "_ga" || name.startsWith("_ga_")) {
                document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
                document.cookie = `${name}=; Max-Age=0; path=/; Domain=${hostname}; SameSite=Lax`;
            }
        });
    }

    acceptButton.addEventListener("click", () => {
        saveConsent("granted");
        hideBanner();
        window.gtag("consent", "update", { analytics_storage: "granted" });
    });

    rejectButton.addEventListener("click", () => {
        saveConsent("denied");
        if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
        removeAnalyticsCookies();
        hideBanner();
    });

    settingsButtons.forEach((button) => button.addEventListener("click", () => showBanner(button)));
    document.querySelectorAll("[data-analytics-event]").forEach((link) => {
        link.addEventListener("click", () => {
            if (currentConsent !== "granted" || !window.gtag) return;
            window.gtag("event", link.dataset.analyticsEvent, {
                link_location: link.dataset.analyticsLocation,
                transport_type: "beacon",
            });
        });
    });

    currentConsent = readConsent();
    if (currentConsent === null) showBanner();
})();
