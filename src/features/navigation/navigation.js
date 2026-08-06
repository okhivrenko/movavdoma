import { contentFor } from "../../content/index.js";
import { isTelegramStartCommand } from "../../domain/acquisition.js";
import { dailyScheduleKeyboardLabel } from "../../domain/helpers.js";

export const MENU_ACTION = Object.freeze({
    ADD_WORD: "add_word",
    ACTIVE_WORDS: "active_words",
    DAILY_WORD: "daily_word",
    LEARNED_WORDS: "learned_words",
    TRANSLATE_TEXT: "translate_text",
    SETTINGS: "settings",
    HELP: "help",
    NEXT_PAGE: "next_page",
    PREVIOUS_PAGE: "previous_page",
    SUPPORT: "support",
    BONUS: "bonus",
    FEEDBACK: "feedback",
    CONTACT: "contact",
    SHARE_BOT: "share_bot",
    ADMIN: "admin",
});

const buttonAction = Object.freeze({
    addWord: MENU_ACTION.ADD_WORD,
    activeWords: MENU_ACTION.ACTIVE_WORDS,
    dailyWord: MENU_ACTION.DAILY_WORD,
    learnedWords: MENU_ACTION.LEARNED_WORDS,
    translateText: MENU_ACTION.TRANSLATE_TEXT,
    help: MENU_ACTION.HELP,
    nextPage: MENU_ACTION.NEXT_PAGE,
    support: MENU_ACTION.SUPPORT,
    bonus: MENU_ACTION.BONUS,
    feedback: MENU_ACTION.FEEDBACK,
    contact: MENU_ACTION.CONTACT,
    shareBot: MENU_ACTION.SHARE_BOT,
    admin: MENU_ACTION.ADMIN,
    previousPage: MENU_ACTION.PREVIOUS_PAGE,
});

export function menuActionFromText(text, locale = "uk") {
    const navigation = contentFor(locale).navigation;

    for (const [buttonName, action] of Object.entries(buttonAction)) {
        if (text === navigation.buttons[buttonName]) {
            return action;
        }
    }

    if (
        text.startsWith(navigation.schedulePrefix) ||
        navigation.legacySchedulePrefixes.some((prefix) => text.startsWith(prefix)) ||
        navigation.legacySettingsButtons.includes(text)
    ) {
        return MENU_ACTION.SETTINGS;
    }

    return null;
}

export function mainKeyboard(showAdmin = false, page = 1, dailySettings, locale = "uk") {
    const { buttons } = contentFor(locale).navigation;
    const firstPage = [
        [{ text: buttons.addWord }, { text: buttons.activeWords }],
        [{ text: buttons.dailyWord }, { text: buttons.learnedWords }],
        [{ text: buttons.translateText }, { text: dailyScheduleKeyboardLabel(dailySettings) }],
        [{ text: buttons.help }, { text: buttons.nextPage }],
    ];
    const secondPage = [
        [{ text: buttons.support }, { text: buttons.bonus }],
        [{ text: buttons.feedback }, { text: buttons.contact }],
    ];

    if (showAdmin) {
        secondPage.push([{ text: buttons.admin }]);
    }

    secondPage.push([{ text: buttons.shareBot }, { text: buttons.previousPage }]);

    return {
        keyboard: page === 2 ? secondPage : firstPage,
        resize_keyboard: true,
        is_persistent: true,
    };
}

export function shouldClearPendingFeedback(text, locale = "uk") {
    const action = menuActionFromText(text, locale);
    return action !== MENU_ACTION.FEEDBACK && (text.startsWith("/") || action !== null);
}

export async function handleNavigationMessage(env, text, context, dependencies) {
    const { chatId, userId } = context;
    const {
        isAdmin,
        keyboardForUser,
        markInterfaceVersion,
        sendMessage,
        sendActiveWordList,
        sendLearnedWordList,
        sendDailySettings,
        sendTextTranslationMenu,
        sendTodayDailyWord,
        sendDonationInstructions,
        submitDonationBonusRequest,
        notifyPendingDonationRequests,
        startFeedback,
        adminHelpText,
        adminKeyboard,
        sendHelp,
        privacyPolicyUrl,
        addWordHint,
        referralInvitation,
        logError,
    } = dependencies;
    const content = contentFor();
    const { copy } = content.navigation;
    const action = menuActionFromText(text);

    if (isTelegramStartCommand(text)) {
        await sendMessage(env, chatId, dependencies.welcome(await dependencies.getDailySettings(env, userId)), await keyboardForUser(env, userId));
        await markInterfaceVersion(env, userId);
        return true;
    }

    if (text === "/menu") {
        await sendMessage(env, chatId, copy.menu, await keyboardForUser(env, userId));
        await markInterfaceVersion(env, userId);
        return true;
    }

    if (text === "/add" || action === MENU_ACTION.ADD_WORD) {
        await sendMessage(env, chatId, addWordHint);
        return true;
    }

    if (action === MENU_ACTION.NEXT_PAGE || action === MENU_ACTION.PREVIOUS_PAGE) {
        const page = action === MENU_ACTION.NEXT_PAGE ? 2 : 1;
        await sendMessage(env, chatId, page === 2 ? copy.additionalMenu : copy.mainMenu, await keyboardForUser(env, userId, page));
        return true;
    }

    if (action === MENU_ACTION.ACTIVE_WORDS) {
        await sendActiveWordList(env, chatId, userId);
        return true;
    }

    if (action === MENU_ACTION.LEARNED_WORDS) {
        await sendLearnedWordList(env, chatId, userId);
        return true;
    }

    if (action === MENU_ACTION.SETTINGS) {
        await sendDailySettings(env, chatId, userId);
        return true;
    }

    if (action === MENU_ACTION.TRANSLATE_TEXT) {
        await sendTextTranslationMenu(env, chatId);
        return true;
    }

    if (action === MENU_ACTION.DAILY_WORD) {
        try {
            await sendTodayDailyWord(env, chatId, userId);
        } catch (error) {
            logError("manual_daily_word_failed", error);
            await sendMessage(env, chatId, copy.dailyWordFailed);
        }
        return true;
    }

    if (action === MENU_ACTION.SUPPORT) {
        try {
            await sendDonationInstructions(env, chatId, userId);
        } catch (error) {
            logError("donation_instructions_failed", error);
            await sendMessage(env, chatId, copy.donationInstructionsFailed);
        }
        return true;
    }

    if (action === MENU_ACTION.BONUS) {
        try {
            await submitDonationBonusRequest(env, chatId, userId, notifyPendingDonationRequests);
        } catch (error) {
            logError("donation_bonus_request_failed", error);
            await sendMessage(env, chatId, copy.donationBonusFailed);
        }
        return true;
    }

    if (action === MENU_ACTION.FEEDBACK || action === MENU_ACTION.CONTACT) {
        await startFeedback(
            env,
            chatId,
            userId,
            action === MENU_ACTION.CONTACT ? dependencies.contactPrompt : undefined,
            action === MENU_ACTION.CONTACT ? "contact" : "feedback"
        );
        return true;
    }

    if (action === MENU_ACTION.SHARE_BOT) {
        try {
            const invitation = await referralInvitation(env, userId);
            await sendMessage(env, chatId, invitation.text, invitation.replyMarkup);
        } catch (error) {
            logError("share_bot_link_failed", error);
            await sendMessage(env, chatId, copy.shareBotFailed);
        }
        return true;
    }

    if (action === MENU_ACTION.ADMIN) {
        if (!isAdmin(env, userId)) {
            await sendMessage(env, chatId, copy.adminOnly);
            return true;
        }
        await sendMessage(env, chatId, adminHelpText(), adminKeyboard());
        return true;
    }

    if (action === MENU_ACTION.HELP || text === "/help") {
        await sendHelp(env, chatId, userId, keyboardForUser);
        return true;
    }

    if (text === "/privacy") {
        await sendMessage(env, chatId, copy.privacyPolicy(privacyPolicyUrl), await keyboardForUser(env, userId));
        return true;
    }

    return false;
}
