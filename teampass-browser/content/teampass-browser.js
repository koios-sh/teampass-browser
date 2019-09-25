'use strict';

// contains already called method names
var _called = {};
_called.retrieveCredentials = false;
_called.clearLogins = false;
_called.manualFillRequested = 'none';
let _singleInputEnabledForPage = false;
const _maximumInputs = 100;

// Count of detected form fields on the page
var _detectedFields = 0;

// Element id's containing input fields detected by MutationObserver
var _observerIds = [];

// Document URL
let _documentURL = document.location.href;

// These are executed in each frame
browser.runtime.onMessage.addListener(function(req, sender) {
    if ('action' in req) {
        if (req.action === 'fill_user_pass_with_specific_login') {
            if (tp.credentials[req.id]) {
                let combination = null;
                if (tp.u) {
                    tp.setValueWithChange(tp.u, tp.credentials[req.id].login);
                    combination = tpFields.getCombination('username', tp.u);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [ req.id ]
                    });
                    tp.u.focus();
                }
                if (tp.p) {
                    tp.setValueWithChange(tp.p, tp.credentials[req.id].password);
                    browser.runtime.sendMessage({
                        action: 'page_set_login_id', args: [ req.id ]
                    });
                    combination = tpFields.getCombination('password', tp.p);
                }

                let list = [];
                if (tp.fillInStringFields(combination.fields, tp.credentials[req.id].stringFields, list)) {
                    tpForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
                }
            }
        } else if (req.action === 'fill_username_password') {
            _called.manualFillRequested = 'both';
            tp.receiveCredentialsIfNecessary().then((response) => {
                tp.fillInFromActiveElement(false);
            });
        } else if (req.action === 'fill_password') {
            _called.manualFillRequested = 'pass';
            tp.receiveCredentialsIfNecessary().then((response) => {
                tp.fillInFromActiveElement(false, true); // passOnly to true
            });
        } else if (req.action === 'fill_totp') {
            tp.receiveCredentialsIfNecessary().then((response) => {
                tp.fillInFromActiveElementTOTPOnly(false);
            });
        } else if (req.action === 'clear_credentials') {
            tpEvents.clearCredentials();
            return Promise.resolve();
        } else if (req.action === 'activated_tab') {
            tpEvents.triggerActivatedTab();
            return Promise.resolve();
        } else if (req.action === 'ignore_site') {
            tp.ignoreSite(req.args);
        } else if (req.action === 'check_database_hash' && 'hash' in req) {
            tp.detectDatabaseChange(req.hash);
        } else if (req.action === 'activate_password_generator') {
            tp.initPasswordGenerator(tpFields.getAllFields());
        } else if (req.action === 'remember_credentials') {
            tp.contextMenuRememberCredentials();
        } else if (req.action === 'choose_credential_fields') {
            tpDefine.init();
        } else if (req.action === 'redetect_fields') {
            browser.runtime.sendMessage({
                action: 'load_settings'
            }).then((response) => {
                tp.settings = response;
                tp.initCredentialFields(true);
            });
        } else if (req.action === 'show_password_generator') {
            tpPassword.trigger();
        }
    }
});

function _f(fieldId) {
    const inputs = document.querySelectorAll(`input[data-tp-id='${fieldId}']`);
    return inputs.length > 0 ? inputs[0] : null;
}

function _fs(fieldId) {
    const inputs = document.querySelectorAll(`input[data-tp-id='${fieldId}'], select[data-tp-id='${fieldId}']`);
    return inputs.length > 0 ? inputs[0] : null;
}


var tpForm = {};

tpForm.init = function(form, credentialFields) {
    if (!form.getAttribute('tpForm-initialized') && (credentialFields.password || credentialFields.username)) {
        form.setAttribute('tpForm-initialized', true);
        tpForm.setInputFields(form, credentialFields);
        form.addEventListener('submit', tpForm.onSubmit);

        const submitButton = tp.getSubmitButton(form);
        if (submitButton !== undefined) {
            submitButton.addEventListener('click', tpForm.onSubmit);
        }
        tpForm.form = form;
    }
};

tpForm.destroy = function(form, credentialFields) {
    if (form === false && credentialFields) {
        const field = _f(credentialFields.password) || _f(credentialFields.username);
        if (field) {
            form = field.closest('form');
        }
    }

    if (form && form.length > 0) {
        form.removeEventListener('submit', tpForm.onSubmit);
    }
};

tpForm.setInputFields = function(form, credentialFields) {
    form.setAttribute('tpUsername', credentialFields.username);
    form.setAttribute('tpPassword', credentialFields.password);
};

tpForm.onSubmit = function() {
    const form = this.nodeName === 'FORM' ? this : (this.form ? this.form : tpForm.form);
    const usernameId = form.getAttribute('tpUsername');
    const passwordId = form.getAttribute('tpPassword');

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(usernameId);
    const passwordField = _f(passwordId);

    if (usernameField) {
        usernameValue = usernameField.value || usernameField.placeholder;
    }
    if (passwordField) {
        passwordValue = passwordField.value;
    }

    tp.rememberCredentials(usernameValue, passwordValue);
};


var tpFields = {};

tpFields.inputQueryPattern = 'input[type=\'text\'], input[type=\'email\'], input[type=\'password\'], input[type=\'tel\'], input[type=\'number\'], input[type=\'username\'], input:not([type])';

// copied from Sizzle.js
tpFields.rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g;
tpFields.fcssescape = function(ch, asCodePoint) {
    if (asCodePoint) {
        // U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
        if (ch === '\0') {
            return '\uFFFD';
        }

        // Control characters and (dependent upon position) numbers get escaped as code points
        return ch.slice(0, -1) + '\\' + ch.charCodeAt(ch.length - 1).toString(16) + ' ';
    }

    // Other potentially-special ASCII characters get backslash-escaped
    return '\\' + ch;
};

// Unique number as new IDs for input fields
tpFields.uniqueNumber = 342845638;
// Objects with combination of username + password fields
tpFields.combinations = [];

tpFields.setUniqueId = function(field) {
    if (field && !field.getAttribute('data-tp-id')) {
        // Use ID of field if it is unique
        const fieldId = field.getAttribute('id');
        if (fieldId) {
            const foundIds = document.querySelectorAll('input#' + tpFields.prepareId(fieldId));
            if (foundIds.length === 1) {
                field.setAttribute('data-tp-id', fieldId);
                return;
            }
        }

        // Create own ID if no ID is set for this field
        tpFields.uniqueNumber += 1;
        field.setAttribute('data-tp-id', 'tppw' + String(tpFields.uniqueNumber));
    }
};

tpFields.prepareId = function(id) {
    return (id + '').replace(tpFields.rcssescape, tpFields.fcssescape);
};

/**
 * Returns the first parent element satifying the {@code predicate} mapped by {@code resultFn} or else {@code defaultVal}.
 * @param {HTMLElement} element     The start element (excluded, starting with the parents)
 * @param {function} predicate      Matcher for the element to find, type (HTMLElement) => boolean
 * @param {function} resultFn       Callback function of type (HTMLElement) => {*} called for the first matching element
 * @param {fun} defaultValFn        Fallback return value supplier, if no element matching the predicate can be found
 */
tpFields.traverseParents = function(element, predicate, resultFn = () => true, defaultValFn = () => false) {
    for (let f = element.parentElement; f !== null; f = f.parentElement) {
        if (predicate(f)) {
            return resultFn(f);
        }
    }
    return defaultValFn();
};

tpFields.getOverflowHidden = function(field) {
    return tpFields.traverseParents(field, f => f.style.overflow === 'hidden');
};

// Checks if input field is a search field. Attributes or form action containing 'search', or parent element holding
// role="search" will be identified as a search field.
tpFields.isSearchField = function(target) {
    const attributes = target.attributes;

    // Check element attributes
    for (const attr of attributes) {
        if ((attr.value && (attr.value.toLowerCase().includes('search')) || attr.value === 'q')) {
            return true;
        }
    }

    // Check closest form
    const closestForm = target.closest('form');
    if (closestForm) {
        // Check form action
        const formAction = closestForm.getAttribute('action');
        if (formAction && (formAction.toLowerCase().includes('search') &&
            !formAction.toLowerCase().includes('research'))) {
            return true;
        }

        // Check form class and id
        const closestFormId = closestForm.getAttribute('id');
        const closestFormClass = closestForm.className;
        if (closestFormClass && (closestForm.className.toLowerCase().includes('search') ||
            (closestFormId && closestFormId.toLowerCase().includes('search') && !closestFormId.toLowerCase().includes('research')))) {
            return true;
        }
    }

    // Check parent elements for role="search"
    const roleFunc = f => f.getAttribute('role');
    const roleValue = tpFields.traverseParents(target, roleFunc, roleFunc, () => null);
    if (roleValue && roleValue === 'search') {
        return true;
    }

    return false;
};

tpFields.isVisible = function(field) {
    const rect = field.getBoundingClientRect();

    // Check CSS visibility
    const fieldStyle = getComputedStyle(field);
    if (fieldStyle.visibility && (fieldStyle.visibility === 'hidden' || fieldStyle.visibility === 'collapse')) {
        return false;
    }

    // Check element position and size
    if (rect.x < 0 || rect.y < 0 || rect.width < 8 || rect.height < 8) {
        return false;
    }

    return true;
};

tpFields.getAllFields = function() {
    const fields = [];
    const inputs = tpObserverHelper.getInputs(document);
    for (const i of inputs) {
        if (tpFields.isVisible(i) && !tpFields.isSearchField(i)) {
            tpFields.setUniqueId(i);
            fields.push(i);
        }
    }

    _detectedFields = fields.length;
    return fields;
};

tpFields.prepareVisibleFieldsWithID = function(pattern) {
    const patterns = document.querySelectorAll(pattern);
    for (const i of patterns) {
        if (tpFields.isVisible(i) && i.style.visibility !== 'hidden' && i.style.visibility !== 'collapsed') {
            tpFields.setUniqueId(i);
        }
    }
};

tpFields.getAllCombinations = function(inputs) {
    const fields = [];
    let uField = null;

    for (const i of inputs) {
        if (i) {
            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                const uId = (!uField || uField.length < 1) ? null : uField.getAttribute('data-tp-id');

                const combination = {
                    username: uId,
                    password: i.getAttribute('data-tp-id')
                };
                fields.push(combination);

                // Reset selected username field
                uField = null;
            } else {
                // Username field
                uField = i;
            }
        }
    }

    if (_singleInputEnabledForPage && fields.length === 0 && uField) {
        const combination = {
            username: uField.getAttribute('data-tp-id'),
            password: null
        };
        fields.push(combination);
    }

    return fields;
};

tpFields.getCombination = function(givenType, fieldId) {
    if (tpFields.combinations.length === 0) {
        if (tpFields.useDefinedCredentialFields()) {
            return tpFields.combinations[0];
        }
    }
    // Use defined credential fields (already loaded into combinations)
    const location = tp.getDocumentLocation();
    if (tp.settings['defined-custom-fields'] && tp.settings['defined-custom-fields'][location]) {
        return tpFields.combinations[0];
    }

    for (const c of tpFields.combinations) {
        if (c[givenType] === fieldId) {
            return c;
        }
    }

    // Find new combination
    let combination = {
        username: null,
        password: null
    };

    let newCombi = false;
    if (givenType === 'username') {
        const passwordField = tpFields.getPasswordField(fieldId, true);
        let passwordId = null;
        if (passwordField) {
            passwordId = tpFields.prepareId(passwordField.getAttribute('data-tp-id'));
        }
        combination = {
            username: fieldId,
            password: passwordId
        };
        newCombi = true;
    } else if (givenType === 'password') {
        const usernameField = tpFields.getUsernameField(fieldId, true);
        let usernameId = null;
        if (usernameField) {
            usernameId = tpFields.prepareId(usernameField.getAttribute('data-tp-id'));
        }
        combination = {
            username: usernameId,
            password: fieldId
        };
        newCombi = true;
    }

    if (combination.username || combination.password) {
        tpFields.combinations.push(combination);
    }

    if (combination.username) {
        if (tp.credentials.length > 0) {
            tp.preparePageForMultipleCredentials(tp.credentials);
        }
    }

    if (newCombi) {
        combination.isNew = true;
    }
    return combination;
};

/**
* Return the username field or null if it not exists
*/
tpFields.getUsernameField = function(passwordId, checkDisabled) {
    const passwordField = _f(passwordId);
    if (!passwordField) {
        return null;
    }

    const form = passwordField.closest('form');
    let usernameField = null;

    // Search all inputs on this one form
    if (form) {
        const inputs = form.querySelectorAll(tpFields.inputQueryPattern);
        for (const i of inputs) {
            tpFields.setUniqueId(i);
            if (i.getAttribute('data-tp-id') === passwordId) {
                return false; // Break
            }

            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                return true; // Continue
            }

            usernameField = i;
        }
    } else {
        // Search all inputs on page
        const inputs = tpFields.getAllFields();
        tp.initPasswordGenerator(inputs);
        for (const i of inputs) {
            if (i.getAttribute('data-tp-id') === passwordId) {
                break;
            }

            if (i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                continue;
            }

            usernameField = i;
        }
    }

    if (usernameField && !checkDisabled) {
        const usernameId = usernameField.getAttribute('data-tp-id');
        // Check if usernameField is already used by another combination
        for (const c of tpFields.combinations) {
            if (c.username === usernameId) {
                usernameField = null;
                break;
            }
        }
    }

    tpFields.setUniqueId(usernameField);
    return usernameField;
};

/**
* Return the password field or null if it not exists
*/
tpFields.getPasswordField = function(usernameId, checkDisabled) {
    const usernameField = _f(usernameId);
    if (!usernameField) {
        return null;
    }

    const form = usernameField.closest('form');
    let passwordField = null;

    // Search all inputs on this one form
    if (form) {
        const inputs = form.querySelectorAll('input[type=\'password\']');
        if (inputs.length > 0) {
            passwordField = inputs[0];
        }
        if (passwordField && passwordField.length < 1) {
            passwordField = null;
        }

        if (tp.settings.usePasswordGenerator) {
            tpPassword.init();
            tpPassword.initField(passwordField);
        }
    } else {
        // Search all inputs on page
        const inputs = tpFields.getAllFields();
        tp.initPasswordGenerator(inputs);

        let active = false;
        for (const i of inputs) {
            if (i.getAttribute('data-tp-id') === usernameId) {
                active = true;
            }
            if (active && i.getAttribute('type') && i.getAttribute('type').toLowerCase() === 'password') {
                passwordField = i;
                break;
            }
        }
    }

    if (passwordField && !checkDisabled) {
        const passwordId = passwordField.getAttribute('data-tp-id');
        // Check if passwordField is already used by another combination
        for (const c of tpFields.combinations) {
            if (c.password === passwordId) {
                passwordField = null;
                break;
            }
        }
    }

    tpFields.setUniqueId(passwordField);
    return passwordField;
};

tpFields.prepareCombinations = function(combinations) {
    for (const c of combinations) {
        const pwField = _f(c.password);
        // Needed for auto-complete: don't overwrite manually filled-in password field
        if (pwField && !pwField.getAttribute('tpFields-onChange')) {
            pwField.setAttribute('tpFields-onChange', true);
            pwField.addEventListener('change', function() {
                this.setAttribute('unchanged', false);
            });
        }

        // Initialize form-submit for remembering credentials
        const fieldId = c.password || c.username;
        const field = _f(fieldId);
        if (field) {
            const form = field.closest('form');
            if (form && form.length > 0) {
                tpForm.init(form, c);
            }
        }
    }
};

tpFields.useDefinedCredentialFields = function() {
    const location = tp.getDocumentLocation();
    if (tp.settings['defined-custom-fields'] && tp.settings['defined-custom-fields'][location]) {
        const creds = tp.settings['defined-custom-fields'][location];

        let found = _f(creds.username) || _f(creds.password);
        for (const i of creds.fields) {
            if (_fs(i)) {
                found = true;
                break;
            }
        }

        if (found) {
            const fields = {
                username: creds.username,
                password: creds.password,
                fields: creds.fields
            };
            tpFields.combinations = [];
            tpFields.combinations.push(fields);

            return true;
        }
    }

    return false;
};

var tpObserverHelper = {};
tpObserverHelper.inputTypes = [
    'text',
    'email',
    'password',
    'tel',
    'number',
    'username', // Note: Not a standard
    null // Input field can be without any type. Include these to the list.
];

// Ignores all nodes that doesn't contain elements
tpObserverHelper.ignoredNode = function(target) {
    if (target.nodeType === Node.ATTRIBUTE_NODE ||
        target.nodeType === Node.TEXT_NODE ||
        target.nodeType === Node.CDATA_SECTION_NODE ||
        target.nodeType === Node.PROCESSING_INSTRUCTION_NODE ||
        target.nodeType === Node.COMMENT_NODE ||
        target.nodeType === Node.DOCUMENT_TYPE_NODE ||
        target.nodeType === Node.NOTATION_NODE) {
        return true;
    }
    return false;
};

tpObserverHelper.getInputs = function(target) {
    // Ignores target element if it's not an element node
    if (tpObserverHelper.ignoredNode(target)) {
        return [];
    }

    // Filter out any input fields with type 'hidden' right away
    const inputFields = [];
    Array.from(target.getElementsByTagName('input')).forEach((e) => {
        if (e.type !== 'hidden') {
            inputFields.push(e);
        }
    });

    // Do not allow more visible inputs than _maximumInputs (default value: 100)
    if (inputFields.length === 0 || inputFields.length > _maximumInputs) {
        return [];
    }

    // Only include input fields that match with tpObserverHelper.inputTypes
    const inputs = [];
    for (const i of inputFields) {
        let type = i.getAttribute('type');
        if (type) {
            type = type.toLowerCase();
        }

        if (tpObserverHelper.inputTypes.includes(type)) {
            inputs.push(i);
        }
    }
    return inputs;
};

tpObserverHelper.getId = function(target) {
    return target.classList.length === 0 ? target.id : target.classList;
};

tpObserverHelper.ignoredElement = function(target) {
    // Ignore elements that do not have a className (including SVG)
    if (typeof target.className !== 'string') {
        return true;
    }

    // Ignore TeamPass-Browser classes
    if (target.className && target.className !== undefined &&
        (target.className.includes('tp') || target.className.includes('ui-helper'))) {
        return true;
    }

    return false;
};

tpObserverHelper.handleObserverAdd = function(target) {
    if (tpObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = tpObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    const neededLength = _detectedFields === 1 ? 0 : 1;
    const id = tpObserverHelper.getId(target);
    if (inputs.length > neededLength && !_observerIds.includes(id)) {
        // Save target element id for preventing multiple calls to initCredentialsFields()
        _observerIds.push(id);

        // Sometimes the settings haven't been loaded before new input fields are detected
        if (Object.keys(tp.settings).length === 0) {
            tp.init();
        } else {
            tp.initCredentialFields(true);
        }
    }
};

tpObserverHelper.handleObserverRemove = function(target) {
    if (tpObserverHelper.ignoredElement(target)) {
        return;
    }

    const inputs = tpObserverHelper.getInputs(target);
    if (inputs.length === 0) {
        return;
    }

    // Remove target element id from the list
    const id = tpObserverHelper.getId(target);
    if (_observerIds.includes(id)) {
        const index = _observerIds.indexOf(id);
        if (index >= 0) {
            _observerIds.splice(index, 1);
        }
    }
};

tpObserverHelper.detectURLChange = function() {
    if (_documentURL !== document.location.href) {
        _documentURL = document.location.href;
        tpEvents.clearCredentials();
        tp.initCredentialFields(true);
    }
};

MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

// Detects DOM changes in the document
const observer = new MutationObserver(function(mutations, obs) {
    if (document.visibilityState === 'hidden') {
        return;
    }

    for (const mut of mutations) {
        // Skip text nodes
        if (mut.target.nodeType === Node.TEXT_NODE) {
            continue;
        }

        // Check document URL change and detect new fields
        tpObserverHelper.detectURLChange();

        // Handle attributes only if CSS display is modified
        if (mut.type === 'attributes') {
            const newValue = mut.target.getAttribute(mut.attributeName);
            if (newValue && (newValue.includes('display') || newValue.includes('z-index'))) {
                if (mut.target.style.display !== 'none') {
                    tpObserverHelper.handleObserverAdd(mut.target);
                } else {
                    tpObserverHelper.handleObserverRemove(mut.target);
                }
            } else if (newValue === "" && mut.attributeName === 'style') {
                tpObserverHelper.handleObserverAdd(mut.target);
            }
        } else if (mut.type === 'childList') {
            const addedTarget = (mut.addedNodes.length > 0) ? mut.addedNodes[0] : mut.target;
            const removedTarget = (mut.removedNodes.length > 0) ? mut.removedNodes[0] : mut.target;
            if (!addedTarget.style || addedTarget.style.display !== 'none') {
                tpObserverHelper.handleObserverAdd(addedTarget);
            }
            tpObserverHelper.handleObserverRemove(removedTarget);
        }
    }
});

// define what element should be observed by the observer
// and what types of mutations trigger the callback
observer.observe(document, {
    subtree: true,
    attributes: true,
    childList: true,
    characterData: true,
    attributeFilter: [ 'style' ]
});

var tp = {};
tp.settings = {};
tp.u = null;
tp.p = null;
tp.url = null;
tp.submitUrl = null;
tp.credentials = [];

const initcb = function() {
    browser.runtime.sendMessage({
        action: 'load_settings'
    }).then((response) => {
        tp.settings = response;
        tp.initCredentialFields();
    });
};

if (document.readyState === 'complete' || (document.readyState !== 'loading' && !document.documentElement.doScroll)) {
    initcb();
} else {
    document.addEventListener('DOMContentLoaded', initcb);
}

tp.init = function() {
    initcb();
};

// Clears all from the content and background scripts, including autocomplete
tp.clearAllFromPage = function() {
    tpEvents.clearCredentials();

    browser.runtime.sendMessage({
        action: 'page_clear_logins'
    });

    // Switch back to default popup
    browser.runtime.sendMessage({
        action: 'get_user_info',
        args: []
    });
};

// Switch credentials if database is changed or closed
tp.detectDatabaseChange = function(response) {
    tp.clearAllFromPage();
    if (document.visibilityState !== 'hidden') {
        if (response.new !== '' && response.new !== response.old) {
            _called.retrieveCredentials = false;
            browser.runtime.sendMessage({
                action: 'load_settings'
            }).then((settings) => {
                tp.settings = settings;
                tp.initCredentialFields(true);

                // If user has requested a manual fill through context menu the actual credential filling
                // is handled here when the opened database has been regognized. It's not a pretty hack.
                if (_called.manualFillRequested && _called.manualFillRequested !== 'none') {
                    tp.fillInFromActiveElement(false, _called.manualFillRequested === 'pass');
                    _called.manualFillRequested = 'none';
                }
            });
        }
    }
};

tp.initCredentialFields = function(forceCall) {
    if (_called.initCredentialFields && !forceCall) {
        return;
    }
    _called.initCredentialFields = true;

    browser.runtime.sendMessage({ 'action': 'page_clear_logins', args: [ _called.clearLogins ] }).then(() => {
        _called.clearLogins = true;

        // Check site preferences
        tp.initializeSitePreferences();
        if (tp.settings.sitePreferences) {
            for (const site of tp.settings.sitePreferences) {
                try {
                    if (siteMatch(site.url, window.top.location.href) || site.url === window.top.location.href) {
                        if (site.ignore === IGNORE_FULL) {
                            return;
                        }

                        _singleInputEnabledForPage = site.usernameOnly;
                    }
                } catch (err) {
                    return;
                }
            }
        }

        const inputs = tpFields.getAllFields();
        if (inputs.length === 0) {
            return;
        }

        tpFields.prepareVisibleFieldsWithID('select');
        tp.initPasswordGenerator(inputs);

        if (!tpFields.useDefinedCredentialFields()) {
            // Get all combinations of username + password fields
            tpFields.combinations = tpFields.getAllCombinations(inputs);
        }
        tpFields.prepareCombinations(tpFields.combinations);

        if (tpFields.combinations.length === 0 && inputs.length === 0) {
            browser.runtime.sendMessage({
                action: 'show_default_browseraction'
            });
            return;
        }

        tp.url = document.location.origin;
        tp.submitUrl = tp.getFormActionUrl(tpFields.combinations[0]);
        const keyword = '';//_f(tpFields.combinations[0].username).value;

        // Get submitUrl for a single input
        if (!tp.submitUrl && tpFields.combinations.length === 1 && inputs.length === 1) {
            tp.submitUrl = tp.getFormActionUrlFromSingleInput(inputs[0]);
        }

        if (tp.settings.autoRetrieveCredentials && _called.retrieveCredentials === false && (tp.url && tp.submitUrl)) {
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [tp.url, keyword ]
            }).then(tp.retrieveCredentialsCallback).catch((e) => {
                console.log(e);
            });
        } else if (_singleInputEnabledForPage) {
            tp.preparePageForMultipleCredentials(tp.credentials);
        } else {
            tp.prepareUserNameFieldIcon();
        }
    });
};

tp.initPasswordGenerator = function(inputs) {
    if (tp.settings.usePasswordGenerator) {
        tpPassword.init();

        for (let i = 0; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].getAttribute('type') && inputs[i].getAttribute('type').toLowerCase() === 'password') {
                tpPassword.initField(inputs[i], inputs, i);
            }
        }
    }
};

tp.receiveCredentialsIfNecessary = function() {
    return new Promise((resolve, reject) => {
        if (tp.credentials.length === 0 && _called.retrieveCredentials === false) {
            browser.runtime.sendMessage({
                action: 'retrieve_credentials',
                args: [ tp.url, '' ] // Sets triggerUnlock to true
            }).then((credentials) => {
                // If the database was locked, this is scope never met. In these cases the response is met at tp.detectDatabaseChange
                _called.manualFillRequested = 'none';
                tp.retrieveCredentialsCallback(credentials, false);
                resolve(credentials);
            });
        } else {
            resolve(tp.credentials);
        }
    });
};

tp.retrieveCredentialsCallback = function(credentials, dontAutoFillIn) {
    if (tpFields.combinations.length > 0) {
        tp.u = _f(tpFields.combinations[0].username);
        tp.p = _f(tpFields.combinations[0].password);
    }

    if (credentials && credentials.error_code === 0) {
        tp.credentials = credentials.data;
        tp.prepareFieldsForCredentials(!Boolean(dontAutoFillIn));
        _called.retrieveCredentials = true;
    }
};

tp.prepareFieldsForCredentials = function(autoFillInForSingle) {
    // Only one login for this site
    // if (autoFillInForSingle && tp.settings.autoFillSingleEntry && tp.credentials.length === 1) {
    //     let combination = null;
    //     if (!tp.p && !tp.u && tpFields.combinations.length > 0) {
    //         tp.u = _f(tpFields.combinations[0].username);
    //         tp.p = _f(tpFields.combinations[0].password);
    //         combination = tpFields.combinations[0];
    //     }
    //     if (tp.u) {
    //         tp.setValueWithChange(tp.u, tp.credentials[0].login);
    //         combination = tpFields.getCombination('username', tp.u);
    //     }
    //     if (tp.p) {
    //         tp.setValueWithChange(tp.p, tp.credentials[0].password);
    //         combination = tpFields.getCombination('password', tp.p);
    //     }

    //     if (combination) {
    //         let list = [];
    //         if (tp.fillInStringFields(combination.fields, tp.credentials[0].stringFields, list)) {
    //             tpForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
    //         }
    //     }

    //     // Generate popup-list of usernames + descriptions
    //     browser.runtime.sendMessage({
    //         action: 'popup_login',
    //         args: [ [ `${tp.credentials[0].login} (${tp.credentials[0].name})` ] ]
    //     });
    // } else {// if (tp.credentials.length > 1 || (tp.credentials.length > 0 && (!tp.settings.autoFillSingleEntry || !autoFillInForSingle))) {
        tp.preparePageForMultipleCredentials(tp.credentials);
    // }
};

tp.preparePageForMultipleCredentials = function(credentials) {
    function getLoginText(credential) {
        const visibleLogin = (credential.login.length > 0) ? credential.login : credential.email;
        return `${credential.label} (${visibleLogin})`;
    }

    // Add usernames + descriptions to autocomplete-list and popup-list
    const usernames = [];
    tpAutocomplete.elements = [];
    for (let i = 0; i < credentials.length; i++) {
        const loginText = getLoginText(credentials[i]);
        usernames.push(loginText);

        const item = {
            label: loginText,
            value: credentials[i].password,
            loginId: i
        };
        tpAutocomplete.elements.push(item);
    }

    // Generate popup-list of usernames + descriptions
    browser.runtime.sendMessage({
        action: 'popup_login',
        args: [ usernames ]
    });

    // Initialize autocomplete for username fields
    // if (tp.settings.autoCompleteUsernames) {
    tp.prepareUserNameFieldIcon();
    // }
};

tp.prepareUserNameFieldIcon = function() {
    for (const i of tpFields.combinations) {
        // Both username and password fields are visible
        if (_detectedFields >= 2) {
            if (_f(i.username)) {
                tpAutocomplete.create(_f(i.username), false, tp.settings.autoSubmit);
            }
        } else if (_detectedFields === 1) {
            if (_f(i.username)) {
                tpAutocomplete.create(_f(i.username), false, tp.settings.autoSubmit);
            }
            if (_f(i.password)) {
                tpAutocomplete.create(_f(i.password), false, tp.settings.autoSubmit);
            }
        }
    }
};

tp.getFormActionUrl = function(combination) {
    if (!combination) {
        return null;
    }

    const field = _f(combination.password) || _f(combination.username);
    if (field === null) {
        return null;
    }

    const form = field.closest('form');
    let action = null;

    if (form && form.length > 0) {
        action = form[0].action;
    }

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

tp.getFormActionUrlFromSingleInput = function(field) {
    if (!field) {
        return null;
    }

    let action = field.formAction;

    if (typeof(action) !== 'string' || action === '') {
        action = document.location.origin + document.location.pathname;
    }

    return action;
};

// Get the form submit button instead if action URL is same as the page itself
tp.getSubmitButton = function(form) {
    const action = tp.submitUrl || form.action;
    if (action.includes(document.location.origin + document.location.pathname)) {
        for (const i of form.elements) {
            if (i.type === 'submit') {
                return i;
            }
        }
    }

    // Try to find another button in form. Select the first one.
    let buttons = Array.from(form.querySelectorAll('button[type=\'button\'], a[onclick], input[type=\'button\'], button:not([type])'));
    if (buttons.length > 0) {
        return buttons[0];
    }

    // Try to find another button in document. Select the first one.
    buttons = Array.from(document.querySelectorAll('button[type=\'button\'], input[type=\'button\'], button:not([type])'));
    if (buttons.length > 0) {
        return buttons[0];
    }

    return undefined;
};

tp.fillInCredentials = function(combination, onlyPassword, suppressWarnings) {
    const action = tp.getFormActionUrl(combination);
    const u = _f(combination.username);
    const p = _f(combination.password);

    if (combination.isNew) {
        // Initialize form-submit for remembering credentials
        const fieldId = combination.password || combination.username;
        const field = _f(fieldId);
        if (field) {
            const form2 = field.closest('form');
            if (form2 && form2.length > 0) {
                tpForm.init(form2, combination);
            }
        }
    }

    if (u) {
        tp.u = u;
    }
    if (p) {
        tp.p = p;
    }

    if (tp.url === document.location.origin && tp.submitUrl === action && tp.credentials.length > 0) {
        tp.fillIn(combination, onlyPassword, suppressWarnings);
    } else {
        tp.url = document.location.origin;
        tp.submitUrl = action;

        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ tp.url, '' ]
        }).then((credentials) => {
            tp.retrieveCredentialsCallback(credentials, true);
            tp.fillIn(combination, onlyPassword, suppressWarnings);
        });
    }
};

tp.fillInFromActiveElement = function(suppressWarnings, passOnly = false) {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        if (tpFields.combinations.length > 0) {
            tp.fillInCredentials(tpFields.combinations[0], passOnly, suppressWarnings);

            // Focus to the input field
            const field = _f(passOnly ? tpFields.combinations[0].password : tpFields.combinations[0].username);
            if (field) {
                field.focus();
            }
        }
        return;
    }

    tpFields.setUniqueId(el);
    const fieldId = tpFields.prepareId(el.getAttribute('data-tp-id'));
    let combination = null;
    if (el.getAttribute('type') === 'password') {
        combination = tpFields.getCombination('password', fieldId);
    } else {
        combination = tpFields.getCombination('username', fieldId);
    }

    if (passOnly) {
        if (!_f(combination.password)) {
            const message = tr('fieldsNoPasswordField');
            browser.runtime.sendMessage({
                action: 'show_notification',
                args: [ message ]
            });
            return;
        }
    }

    delete combination.loginId;

    tp.fillInCredentials(combination, passOnly, suppressWarnings);
};

tp.fillInFromActiveElementTOTPOnly = function() {
    const el = document.activeElement;
    tpFields.setUniqueId(el);
    const fieldId = tpFields.prepareId(el.getAttribute('data-tp-id'));

    browser.runtime.sendMessage({
        action: 'page_get_login_id'
    }).then((pos) => {
        if (pos >= 0 && tp.credentials[pos]) {
            // Check the value from stringFields (to be removed)
            const currentField = _fs(fieldId);
            if (tp.credentials[pos].stringFields && tp.credentials[pos].stringFields.length > 0) {
                const stringFields = tp.credentials[pos].stringFields;
                for (const s of stringFields) {
                    const val = s['KPH: {TOTP}'];
                    if (val) {
                        tp.setValue(currentField, val);
                    }
                }
            } else if (tp.credentials[pos].totp && tp.credentials[pos].totp.length > 0) {
                tp.setValue(currentField, tp.credentials[pos].totp);
            }
        }
    });
};

tp.setValue = function(field, value) {
    if (field.matches('select')) {
        value = value.toLowerCase().trim();
        const options = field.querySelectorAll('option');
        for (const o of options) {
            if (o.textContent.toLowerCase().trim() === value) {
                tp.setValueWithChange(field, o.value);
                return false;
            }
        }
    } else {
        tp.setValueWithChange(field, value);
    }
};

tp.fillInStringFields = function(fields, stringFields, filledInFields) {
    let filledIn = false;

    filledInFields.list = [];
    if (fields && stringFields && fields.length > 0 && stringFields.length > 0) {
        for (let i = 0; i < fields.length; i++) {
            const currentField = _fs(fields[i]);
            const stringFieldValue = Object.values(stringFields[i]);
            if (currentField && stringFieldValue[0]) {
                tp.setValue(currentField, stringFieldValue[0]);
                filledInFields.list.push(fields[i]);
                filledIn = true;
            }
        }
    }

    return filledIn;
};

tp.setValueWithChange = function(field, value) {
    if (tp.settings.respectMaxLength === true) {
        const attributeMaxlength = field.getAttribute('maxlength');
        if (attributeMaxlength && !isNaN(attributeMaxlength) && attributeMaxlength > 0) {
            value = value.substr(0, attributeMaxlength);
        }
    }

    field.value = value;
    field.dispatchEvent(new Event('input', { 'bubbles': true }));
    field.dispatchEvent(new Event('change', { 'bubbles': true }));
};

tp.fillIn = function(combination, onlyPassword, suppressWarnings) {
    // No credentials available
    if (tp.credentials.length === 0 && !suppressWarnings) {
        const message = tr('credentialsNoLoginsFound');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [ message ]
        });
        return;
    }

    const uField = _f(combination.username);
    const pField = _f(combination.password);

    // Exactly one pair of credentials available
    if (tp.credentials.length === 1) {
        let filledIn = false;
        if (uField && (!onlyPassword || _singleInputEnabledForPage)) {
            tp.setValueWithChange(uField, tp.credentials[0].login);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ 0 ]
            });
            filledIn = true;
        }
        if (pField) {
            pField.setAttribute('type', 'password');
            tp.setValueWithChange(pField, tp.credentials[0].password);
            pField.setAttribute('unchanged', true);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ 0 ]
            });
            filledIn = true;
        }

        let list = [];
        if (tp.fillInStringFields(combination.fields, tp.credentials[0].stringFields, list)) {
            tpForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [ message ]
                });
            }
            return;
        }
    } else if (combination.loginId !== undefined && tp.credentials[combination.loginId]) {
        // Specific login ID given
        let filledIn = false;
        if (uField && (!onlyPassword || _singleInputEnabledForPage)) {
            tp.setValueWithChange(uField, tp.credentials[combination.loginId].login);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ combination.loginId ]
            });
            filledIn = true;
        }

        if (pField) {
            tp.setValueWithChange(pField, tp.credentials[combination.loginId].password);
            pField.setAttribute('unchanged', true);
            browser.runtime.sendMessage({
                action: 'page_set_login_id', args: [ combination.loginId ]
            });
            filledIn = true;
        }

        let list = [];
        if (tp.fillInStringFields(combination.fields, tp.credentials[combination.loginId].stringFields, list)) {
            tpForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
            filledIn = true;
        }

        if (!filledIn) {
            if (!suppressWarnings) {
                const message = tr('fieldsFill');
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [ message ]
                });
            }
            return;
        }
    } else { // Multiple credentials available
        // Check if only one password for given username exists
        let countPasswords = 0;

        if (uField) {
            let valPassword = '';
            let valUsername = '';
            let valStringFields = [];
            const valQueryUsername = uField.value.toLowerCase();

            // Find passwords to given username (even those with empty username)
            for (const c of tp.credentials) {
                if (c.login.toLowerCase() === valQueryUsername) {
                    countPasswords += 1;
                    valPassword = c.password;
                    valUsername = c.login;
                    valStringFields = c.stringFields;
                }
            }

            // For the correct notification message: 0 = no logins, X > 1 = too many logins
            if (countPasswords === 0) {
                countPasswords = tp.credentials.length;
            }

            // Only one mapping username found
            if (countPasswords === 1) {
                if (!onlyPassword) {
                    tp.setValueWithChange(uField, valUsername);
                }

                if (pField) {
                    tp.setValueWithChange(pField, valPassword);
                    pField.setAttribute('unchanged', true);
                }

                let list = [];
                if (tp.fillInStringFields(combination.fields, valStringFields, list)) {
                    tpForm.destroy(false, { 'password': list.list[0], 'username': list.list[1] });
                }
            }

            // User has to select correct credentials by himself
            if (countPasswords > 1) {
                if (!suppressWarnings) {
                    const target = onlyPassword ? pField : uField;
                    if (tpAutocomplete.started) {
                        tpAutocomplete.showList(target);
                    } else {
                        tpAutocomplete.create(target, true, tp.settings.autoSubmit);
                    }
                    target.focus();
                }
                return;
            } else if (countPasswords < 1) {
                if (!suppressWarnings) {
                    const message = tr('credentialsNoUsernameFound');
                    browser.runtime.sendMessage({
                        action: 'show_notification',
                        args: [ message ]
                    });
                }
                return;
            }
        } else {
            if (!suppressWarnings) {
                const target = onlyPassword ? pField : uField;
                if (tpAutocomplete.started) {
                    tpAutocomplete.showList(target);
                } else {
                    tpAutocomplete.create(target, true, tp.settings.autoSubmit);
                }
                target.focus();
                return;
            }
        }
    }

    // Auto-submit
    if (tp.settings.autoSubmit) {
        const form = tp.u.form || tp.p.form;
        const submitButton = tp.getSubmitButton(form);
        if (submitButton !== undefined) {
            submitButton.click();
        } else {
            form.submit();
        }
    }
};

tp.contextMenuRememberCredentials = function() {
    const el = document.activeElement;
    if (el.tagName.toLowerCase() !== 'input') {
        return;
    }

    tpFields.setUniqueId(el);
    const fieldId = tpFields.prepareId(el.getAttribute('data-tp-id'));
    let combination = null;
    if (el.getAttribute('type') === 'password') {
        combination = tpFields.getCombination('password', fieldId);
    } else {
        combination = tpFields.getCombination('username', fieldId);
    }

    let usernameValue = '';
    let passwordValue = '';

    const usernameField = _f(combination.username);
    const passwordField = _f(combination.password);

    if (usernameField) {
        usernameValue = usernameField.value;
    }
    if (passwordField) {
        passwordValue = passwordField.value;
    }

    if (!tp.rememberCredentials(usernameValue, passwordValue)) {
        const message = tr('rememberNothingChanged');
        browser.runtime.sendMessage({
            action: 'show_notification',
            args: [ message ]
        });
    }
};

tp.rememberCredentials = function(usernameValue, passwordValue) {
    // No password given or field cleaned by a site-running script
    // --> no password to save
    if (passwordValue === '') {
        return false;
    }

    let existingCredential = null;
    let nothingChanged = false;

    for (const c of tp.credentials) {
        if (c.login === usernameValue && c.password === passwordValue) {
            nothingChanged = true;
            break;
        }

        if (c.login === usernameValue) {
            existingCredential = c;
        }
    }

    if (!nothingChanged) {
        if (!existingCredential) {
            for (const c of tp.credentials) {
                if (c.login === usernameValue) {
                    existingCredential = c;
                    break;
                }
            }
        }
        const credentialsList = [];
        for (const c of tp.credentials) {
            credentialsList.push(c);
        }

        let url = this.action;
        if (!url) {
            url = tp.getDocumentLocation();
            if (url.indexOf('?') > 0) {
                url = url.substring(0, url.indexOf('?'));
                if (url.length < document.location.origin.length) {
                    url = document.location.origin;
                }
            }
        }

        browser.runtime.sendMessage({
            action: 'set_remember_credentials',
            args: [usernameValue, passwordValue, url, document.title, existingCredential, credentialsList ]
        }).then(() => {
            // var iframe = document.createElement('iframe');
            // iframe.id = "tp-popup-remember";
            // // Must be declared at web_accessible_resources in manifest.json
            // iframe.src = chrome.runtime.getURL("content/remember.html");

            // // Some styles for a fancy sidebar
            // iframe.style.cssText = 'position: fixed;user-select: none;top: 12px;right: 12px;bottom: initial;left: initial;width: 306px;height: 567px;border: 0px;z-index: 2147483646;clip: auto;display: block !important;';
            // document.body.appendChild(iframe);

            // window.addEventListener('message', function (e) {
            //     if (e.data && e.data.type === "removePopupRememberIframe") {
            //         var popupRememberIframe = window.parent.document.getElementById('tp-popup-remember');
            //         if (popupRememberIframe) {
            //             popupRememberIframe.parentNode.removeChild(popupRememberIframe);
            //         }
            //     }
            // });
        });

        return true;
    }

    return false;
};

tp.ignoreSite = function(sites) {
    if (!sites || sites.length === 0) {
        return;
    }

    let site = sites[0];
    tp.initializeSitePreferences();

    if (slashNeededForUrl(site)) {
        site += '/';
    }

    // Check if the site already exists
    let siteExists = false;
    for (const existingSite of tp.settings['sitePreferences']) {
        if (existingSite.url === site) {
            existingSite.ignore = IGNORE_NORMAL;
            siteExists = true;
        }
    }

    if (!siteExists) {
        tp.settings['sitePreferences'].push({
            url: site,
            ignore: IGNORE_NORMAL,
            usernameOnly: false
        });
    }

    browser.runtime.sendMessage({
        action: 'save_settings',
        args: [ tp.settings ]
    });
};

// Delete previously created Object if it exists. It will be replaced by an Array
tp.initializeSitePreferences = function() {
    if (tp.settings['sitePreferences'] !== undefined && tp.settings['sitePreferences'].constructor === Object) {
        delete tp.settings['sitePreferences'];
    }

    if (!tp.settings['sitePreferences']) {
        tp.settings['sitePreferences'] = [];
    }
};

tp.getDocumentLocation = function() {
    return tp.settings.saveDomainOnly ? document.location.origin : document.location.href;
};


var tpEvents = {};

tpEvents.clearCredentials = function() {
    tp.credentials = [];
    tpAutocomplete.elements = [];
    _called.retrieveCredentials = false;

    if (tp.settings.autoCompleteUsernames) {
        for (const c of tpFields.combinations) {
            const uField = _f(c.username);
            if (uField) {
                if (uField.classList.contains('ui-autocomplete-input')) {
                    uField.autocomplete('destroy');
                }
            }
        }
    }
};

tpEvents.triggerActivatedTab = function() {
    // Doesn't run a second time because of _called.initCredentialFields set to true
    tp.init();

    // initCredentialFields calls also "retrieve_credentials", to prevent it
    // check of init() was already called
    if (_called.initCredentialFields && (tp.url && tp.submitUrl) && tp.settings.autoRetrieveCredentials) {
        browser.runtime.sendMessage({
            action: 'retrieve_credentials',
            args: [ tp.url, '' ]
        }).then(tp.retrieveCredentialsCallback).catch((e) => {
            console.log(e);
        });
    }
};
