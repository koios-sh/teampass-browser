'use strict';

var tpDefine = {};

tpDefine.selection = {
    username: null,
    password: null,
    fields: []
};
tpDefine.eventFieldClick = null;
tpDefine.dialog = null;
tpDefine.startPosX = 0;
tpDefine.startPosY = 0;
tpDefine.diffX = 0;
tpDefine.diffY = 0;
tpDefine.keyDown = null;

tpDefine.init = function() {
    const backdrop = tpUI.createElement('div', 'tpDefine-modal-backdrop', { 'id': 'tpDefine-backdrop' });
    const chooser = tpUI.createElement('div', '', { 'id': 'tpDefine-fields' });
    const description = tpUI.createElement('div', '', { 'id': 'tpDefine-description' });

    backdrop.append(description);
    document.body.append(backdrop);
    document.body.append(chooser);

    tpFields.getAllFields();
    tpFields.prepareVisibleFieldsWithID('select');

    tpDefine.initDescription();
    tpDefine.resetSelection();
    tpDefine.prepareStep1();
    tpDefine.markAllUsernameFields('#tpDefine-fields');

    tpDefine.dialog = $('#tpDefine-description');
    tpDefine.dialog.onmousedown = function(e) {
        tpDefine.mouseDown(e);
    };

    document.addEventListener('keydown', tpDefine.keyDown);
};

tpDefine.close = function() {
    $('#tpDefine-backdrop').remove();
    $('#tpDefine-fields').remove();
    document.removeEventListener('keydown', tpDefine.keyDown);
};

tpDefine.mouseDown = function(e) {
    tpDefine.selected = tpDefine.dialog;
    tpDefine.startPosX = e.clientX;
    tpDefine.startPosY = e.clientY;
    tpDefine.diffX = tpDefine.startPosX - tpDefine.dialog.offsetLeft;
    tpDefine.diffY = tpDefine.startPosY - tpDefine.dialog.offsetTop;
    return false;
};

tpDefine.initDescription = function() {
    const description = $('#tpDefine-description');
    const h1 = tpUI.createElement('div', '', { 'id': 'tpDefine-chooser-headline' });
    const help = tpUI.createElement('div', 'tpDefine-chooser-help', { 'id': 'tpDefine-help' });

    // Show keyboard shortcuts help text
    const keyboardHelp = tpUI.createElement('div', 'tpDefine-keyboardHelp', {}, `${tr('optionsKeyboardShortcutsHeader')}:`);
    keyboardHelp.style.marginBottom = '5px';
    keyboardHelp.appendMultiple(document.createElement('br'), tpUI.createElement('kbd', '', {}, 'Escape'), ' ' + tr('defineDismiss'));
    keyboardHelp.appendMultiple(document.createElement('br'), tpUI.createElement('kbd', '', {}, 'S'), ' ' + tr('defineSkip'));
    keyboardHelp.appendMultiple(document.createElement('br'), tpUI.createElement('kbd', '', {}, 'A'), ' ' + tr('defineAgain'));
    keyboardHelp.appendMultiple(document.createElement('br'), tpUI.createElement('kbd', '', {}, 'C'), ' ' + tr('defineConfirm'));
    keyboardHelp.appendMultiple(document.createElement('br'), tpUI.createElement('kbd', '', {}, 'M'), ' ' + tr('defineMore'));
    keyboardHelp.appendMultiple(document.createElement('br'), tpUI.createElement('kbd', '', {}, 'D'), ' ' + tr('defineDiscard'));

    description.appendMultiple(h1, help, keyboardHelp);

    const buttonDismiss = tpUI.createElement('button', 'tp-button tp-red-button', { 'id': 'tpDefine-btn-dismiss' }, tr('defineDismiss'));
    buttonDismiss.addEventListener('click', tpDefine.close);

    const buttonSkip = tpUI.createElement('button', 'tp-button tp-orange-button', { 'id': 'tpDefine-btn-skip' }, tr('defineSkip'));
    buttonSkip.style.marginRight = '5px';
    buttonSkip.addEventListener('click', tpDefine.skip);

    const buttonMore = tpUI.createElement('button', 'tp-button tp-orange-button', { 'id': 'tpDefine-btn-more' }, tr('defineMore'));
    buttonMore.style.marginRight = '5px';
    buttonMore.style.marginLeft = '5px';
    buttonMore.addEventListener('click', tpDefine.more);

    const buttonAgain = tpUI.createElement('button', 'tp-button tp-blue-button', { 'id': 'tpDefine-btn-again' }, tr('defineAgain'));
    buttonAgain.style.marginRight = '5px';
    buttonAgain.addEventListener('click', tpDefine.again);

    const buttonConfirm = tpUI.createElement('button', 'tp-button tp-green-button', { 'id': 'tpDefine-btn-confirm' }, tr('defineConfirm'));
    buttonConfirm.style.marginRight = '15px';
    buttonConfirm.style.display = 'none';
    buttonConfirm.addEventListener('click', tpDefine.confirm);

    description.appendMultiple(buttonConfirm, buttonSkip, buttonMore, buttonAgain, buttonDismiss);

    const location = tp.getDocumentLocation();
    if (tp.settings['defined-custom-fields'] && tp.settings['defined-custom-fields'][location]) {
        const div = tpUI.createElement('div', 'alreadySelected', {});
        const defineDiscard = tpUI.createElement('p', '', {}, tr('defineAlreadySelected'));
        const buttonDiscard = tpUI.createElement('button', 'tp-button tp-red-button', { 'id': 'tpDefine-btn-discard' }, tr('defineDiscard'));
        buttonDiscard.style.marginTop = '5px';
        buttonDiscard.addEventListener('click', tpDefine.discard);

        div.appendMultiple(defineDiscard, buttonDiscard);
        description.append(div);
    }
};

tpDefine.resetSelection = function() {
    tpDefine.selection = {
        username: null,
        password: null,
        fields: []
    };

    const fields = $('#tpDefine-fields');
    if (fields) {
        fields.textContent = '';
    }
};

tpDefine.isFieldSelected = function(tpId) {
    if (tpId) {
        return (
            tpId === tpDefine.selection.username ||
            tpId === tpDefine.selection.password ||
            tpId in tpDefine.selection.fields
        );
    }
    return false;
};

tpDefine.markAllUsernameFields = function(chooser) {
    tpDefine.eventFieldClick = function(e, elem) {
        const field = elem || e.currentTarget;
        tpDefine.selection.username = field.getAttribute('data-tp-id');
        field.classList.add('tpDefine-fixed-username-field');
        field.textContent = tr('username');
        field.onclick = null;
        tpDefine.prepareStep2();
        tpDefine.markAllPasswordFields('#tpDefine-fields');
    };
    tpDefine.markFields(chooser, tpFields.inputQueryPattern);
};

tpDefine.markAllPasswordFields = function(chooser, more = false) {
    tpDefine.eventFieldClick = function(e, elem) {
        const field = elem || e.currentTarget;
        tpDefine.selection.password = field.getAttribute('data-tp-id');
        field.classList.add('tpDefine-fixed-password-field');
        field.textContent = tr('password');
        field.onclick = null;
        tpDefine.prepareStep3();
        tpDefine.markAllStringFields('#tpDefine-fields');
    };
    if (more) {
        tpDefine.markFields(chooser, tpFields.inputQueryPattern);
    } else {
        tpDefine.markFields(chooser, 'input[type=\'password\']');
    }
};

tpDefine.markAllStringFields = function(chooser) {
    tpDefine.eventFieldClick = function(e, elem) {
        const field = elem || e.currentTarget;
        const value = field.getAttribute('data-tp-id');
        tpDefine.selection.fields[value] = true;

        const count = Object.keys(tpDefine.selection.fields).length;
        field.classList.add('tpDefine-fixed-string-field');
        field.textContent = tr('defineStringField') + String(count);
        field.onclick = null;
    };
    tpDefine.markFields(chooser, tpFields.inputQueryPattern + ', select');
};

tpDefine.markFields = function(chooser, pattern) {
    let index = 1;
    let firstInput = null;
    const inputs = document.querySelectorAll(pattern);

    for (const i of inputs) {
        if (tpDefine.isFieldSelected(i.getAttribute('data-tp-id'))) {
            continue;
        }

        if (tpFields.isVisible(i)) {
            const field = tpUI.createElement('div', 'tpDefine-fixed-field', { 'data-tp-id': i.getAttribute('data-tp-id') });
            const rect = i.getBoundingClientRect();
            field.style.top = rect.top + 'px';
            field.style.left = rect.left + 'px';
            field.style.width = rect.width + 'px';
            field.style.height = rect.height + 'px';
            field.textContent = String(index);
            field.addEventListener('click', function(e) {
                tpDefine.eventFieldClick(e);
            });
            field.addEventListener('mouseenter', function() {
                field.classList.add('tpDefine-fixed-hover-field');
            });
            field.addEventListener('mouseleave', function() {
                field.classList.remove('tpDefine-fixed-hover-field');
            });
            i.addEventListener('focus', function() {
                field.classList.add('tpDefine-fixed-hover-field');
            });
            i.addEventListener('blur', function() {
                field.classList.remove('tpDefine-fixed-hover-field');
            });
            const elem = $(chooser);
            if (elem) {
                elem.append(field);
                firstInput = field;
                ++index;
            }
        }
    }

    if (firstInput) {
        firstInput.focus();
    }
};

tpDefine.prepareStep1 = function() {
    const help = $('#tpDefine-help');
    help.style.marginBottom = '10px';
    help.textContent = tr('defineKeyboardText');

    removeContent('div#tpDefine-fixed-field');
    $('#tpDefine-chooser-headline').textContent = tr('defineChooseUsername');
    tpDefine.dataStep = 1;
    $('#tpDefine-btn-skip').style.display = 'inline-block';
    $('#tpDefine-btn-confirm').style.display = 'none';
    $('#tpDefine-btn-again').style.display = 'none';
    $('#tpDefine-btn-more').style.display = 'none';
};

tpDefine.prepareStep2 = function() {
    const help = $('#tpDefine-help');
    help.style.marginBottom = '10px';
    help.textContent = tr('defineKeyboardText');

    removeContent('div.tpDefine-fixed-field:not(.tpDefine-fixed-username-field)');
    $('#tpDefine-chooser-headline').textContent = tr('defineChoosePassword');
    tpDefine.dataStep = 2;
    $('#tpDefine-btn-again').style.display = 'inline-block';
    $('#tpDefine-btn-more').style.display = 'inline-block';
};

tpDefine.prepareStep3 = function() {
    $('#tpDefine-help').style.marginBottom = '10px';
    $('#tpDefine-help').textContent = tr('defineHelpText');

    removeContent('div.tpDefine-fixed-field:not(.tpDefine-fixed-username-field):not(.tpDefine-fixed-password-field)');
    $('#tpDefine-chooser-headline').textContent = tr('defineConfirmSelection');
    tpDefine.dataStep = 3;
    $('#tpDefine-btn-skip').style.display = 'none';
    $('#tpDefine-btn-more').style.display = 'none';
    $('#tpDefine-btn-again').style.display = 'inline-block';
    $('#tpDefine-btn-confirm').style.display = 'inline-block';
};

tpDefine.skip = function() {
    if (tpDefine.dataStep === 1) {
        tpDefine.selection.username = null;
        tpDefine.prepareStep2();
        tpDefine.markAllPasswordFields('#tpDefine-fields');
    } else if (tpDefine.dataStep === 2) {
        tpDefine.selection.password = null;
        tpDefine.prepareStep3();
        tpDefine.markAllStringFields('#tpDefine-fields');
    }
};

tpDefine.again = function() {
    tpDefine.resetSelection();
    tpDefine.prepareStep1();
    tpDefine.markAllUsernameFields('#tpDefine-fields');
};

tpDefine.more = function() {
    if (tpDefine.dataStep === 2) {
        tpDefine.prepareStep2();
        tpDefine.markAllPasswordFields('#tpDefine-fields', true);
    }
};

tpDefine.confirm = function() {
    if (tpDefine.dataStep !== 3) {
        return;
    }

    if (!tp.settings['defined-custom-fields']) {
        tp.settings['defined-custom-fields'] = {};
    }

    if (tpDefine.selection.username) {
        tpDefine.selection.username = tpFields.prepareId(tpDefine.selection.username);
    }

    if (tpDefine.selection.password) {
        tpDefine.selection.password = tpFields.prepareId(tpDefine.selection.password);
    }

    const fieldIds = [];
    const fieldKeys = Object.keys(tpDefine.selection.fields);
    for (const i of fieldKeys) {
        fieldIds.push(tpFields.prepareId(i));
    }

    const location = tp.getDocumentLocation();
    tp.settings['defined-custom-fields'][location] = {
        username: tpDefine.selection.username,
        password: tpDefine.selection.password,
        fields: fieldIds
    };

    browser.runtime.sendMessage({
        action: 'save_settings',
        args: [ tp.settings ]
    });

    tpDefine.close();
};

tpDefine.discard = function() {
    if (!$('#tpDefine-btn-discard')) {
        return;
    }

    const location = tp.getDocumentLocation();
    delete tp.settings['defined-custom-fields'][location];

    browser.runtime.sendMessage({
        action: 'save_settings',
        args: [ tp.settings ]
    });

    browser.runtime.sendMessage({
        action: 'load_settings'
    });

    $('div.alreadySelected').remove();
};

// Handle the keyboard events
tpDefine.keyDown = function(e) {
    if (e.key === 'Escape') {
        tpDefine.close();
    } else if (e.key === 'Enter') {
        e.preventDefault();
    } else if (e.keyCode >= 49 && e.keyCode <= 57) {
        // Select input field by number
        e.preventDefault();
        const index = e.keyCode - 48;
        const inputFields = document.querySelectorAll('div.tpDefine-fixed-field:not(.tpDefine-fixed-username-field):not(.tpDefine-fixed-password-field)');

        if (inputFields.length >= index) {
            tpDefine.eventFieldClick(e, inputFields[index - 1]);
        }
    } else if (e.key === 's') {
        e.preventDefault();
        tpDefine.skip();
    } else if (e.key === 'a') {
        e.preventDefault();
        tpDefine.again();
    } else if (e.key === 'c') {
        e.preventDefault();
        tpDefine.confirm();
    } else if (e.key === 'm') {
        e.preventDefault();
        tpDefine.more();
    } else if (e.key === 'd') {
        e.preventDefault();
        tpDefine.discard();
    }
};

const removeContent = function(pattern) {
    const elems = document.querySelectorAll(pattern);
    for (const e of elems) {
        e.remove();
    }
};
