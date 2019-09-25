'use strict';

var tpPassword = {};
tpPassword.created = false;
tpPassword.icon = null;
tpPassword.inputField = null;
tpPassword.selected = null;
tpPassword.startPosX = 0;
tpPassword.startPosY = 0;
tpPassword.diffX = 0;
tpPassword.diffY = 0;
tpPassword.dialog = null;
tpPassword.titleBar = null;

/**
* Detects if the input field appears or disappears -> show/hide the icon
* - boundingClientRect with slightly (< -10) negative values -> hidden
* - intersectionRatio === 0 -> hidden
* - isIntersecting === false -> hidden
* - intersectionRatio > 0 -> shown
* - isIntersecting === true -> shown
*/
try {
    tpPassword.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const rect = DOMRectToArray(entry.boundingClientRect);

            if ((entry.intersectionRatio === 0 && !entry.isIntersecting) || (rect.some(x => x < -10))) {
                tpPassword.icon.style.display = 'none';
            } else if (entry.intersectionRatio > 0 && entry.isIntersecting) {
                tpPassword.icon.style.display = 'block';

                // Wait for possible DOM animations
                setTimeout(() => {
                    tpPassword.setIconPosition(tpPassword.icon, entry.target);
                }, 500);
            }
        }
    });
} catch (err) {
    console.log(err);
}

tpPassword.init = function() {
    if ('initPasswordGenerator' in _called) {
        return;
    }

    _called.initPasswordGenerator = true;
};

tpPassword.initField = function(field, inputs, pos) {
    if (!field) {
        return;
    }

    // Observer the visibility
    if (tpPassword.observer) {
        tpPassword.observer.observe(field);
    }

    if (field.getAttribute('tp-password-generator')) {
        return;
    }

    field.setAttribute('tp-password-generator', true);

    tpPassword.createIcon(field);
    tpPassword.inputField = field;

    let found = false;
    if (inputs) {
        for (let i = pos + 1; i < inputs.length; i++) {
            if (inputs[i] && inputs[i].getAttribute('type') && inputs[i].getAttribute('type').toLowerCase() === 'password') {
                field.setAttribute('tp-pwgen-next-field-id', inputs[i].getAttribute('data-tp-id'));
                field.setAttribute('tp-pwgen-next-is-password-field', (i === 0));
                found = true;
                break;
            }
        }
    }

    field.setAttribute('tp-pwgen-next-field-exists', found);
};

tpPassword.createIcon = function(field) {
    const className = (isFirefox() ? 'key-moz' : 'key');
    const size = (field.offsetHeight > 28) ? 24 : 16;
    let offset = Math.floor((field.offsetHeight - size) / 3);
    offset = (offset < 0) ? 0 : offset;

    const icon = tpUI.createElement('div', 'tp tp-pwgen-icon ' + className,
        {
            'title': tr('passwordGeneratorGenerateText'),
            'alt': tr('passwordGeneratorIcon'),
            'size': size,
            'offset': offset,
            'tp-pwgen-field-id': field.getAttribute('data-tp-id')
        });
    icon.style.zIndex = '99999';
    icon.style.width = String(size) + 'px';
    icon.style.height = String(size) + 'px';

    icon.addEventListener('click', function(e) {
        e.preventDefault();
        tpPassword.showDialog(field, icon);
    });

    tpPassword.setIconPosition(icon, field);
    tpPassword.icon = icon;
    document.body.appendChild(icon);
};

tpPassword.setIconPosition = function(icon, field) {
    const rect = field.getBoundingClientRect();
    const offset = Number(icon.getAttribute('offset'));
    const size = Number(icon.getAttribute('size'));

    icon.style.top = String((rect.top + document.scrollingElement.scrollTop) + offset + 1) + 'px';
    icon.style.left = String((rect.left + document.scrollingElement.scrollLeft) + field.offsetWidth - size - offset) + 'px';
};

tpPassword.createDialog = function() {
    if (tpPassword.created) {
        // If database is open again, generate a new password right away
        const input = $('.tp-pwgen-input');
        if (input.style.display === 'none') {
            tpPassword.generate();
        }
        return;
    }
    tpPassword.created = true;

    const wrapper = tpUI.createElement('div', 'tp');
    const dialog = tpUI.createElement('div', 'tp tp-pwgen-dialog');
    const titleBar = tpUI.createElement('div', 'tp-pwgen-titlebar', {}, tr('passwordGeneratorTitle'));
    const closeButton = tpUI.createElement('div', 'tp-pwgen-close', {}, '×');
    closeButton.addEventListener('click', function(e) {
        tpPassword.openDialog();
    });
    titleBar.append(closeButton);

    const passwordRow = tpUI.createElement('div', 'tp-pwgen-password-row');
    const input = tpUI.createElement('input', 'tp-pwgen-input', { 'placeholder': tr('passwordGeneratorPlaceholder'), 'type': 'text', 'tabindex': '-1' });
    const inputLabel = tpUI.createElement('label', 'tp-pwgen-bits', {}, tr('passwordGeneratorBits', '???'));
    passwordRow.appendMultiple(input, inputLabel);

    const nextFillRow = tpUI.createElement('div', 'tp-pwgen-nextfill-row');
    const checkbox = tpUI.createElement('input', 'tp-pwgen-checkbox', { 'id': 'tp-pwgen-checkbox', 'type': 'checkbox' });
    const checkboxLabel = tpUI.createElement('label', 'tp-pwgen-checkbox-label', { 'for': 'tp-pwgen-checkbox' }, tr('passwordGeneratorLabel'));
    nextFillRow.appendMultiple(checkbox, checkboxLabel);

    // Buttons
    const buttonsRow = tpUI.createElement('div', 'tp-pwgen-buttons');
    const generateButton = tpUI.createElement('button', 'tp-button tp-white-button', { 'id': 'tp-pwgen-btn-generate' }, tr('passwordGeneratorGenerate'));
    const copyButton = tpUI.createElement('button', 'tp-button', { 'id': 'tp-pwgen-btn-copy' }, tr('passwordGeneratorCopy'));
    const fillButton = tpUI.createElement('button', 'tp-button', { 'id': 'tp-pwgen-btn-fill' }, tr('passwordGeneratorFillAndCopy'));

    generateButton.addEventListener('click', function(e) {
        tpPassword.generate(e);
    });

    copyButton.addEventListener('click', function(e) {
        tpPassword.copy(e);
    });

    fillButton.addEventListener('click', function(e) {
        tpPassword.fill(e);
    });

    buttonsRow.appendMultiple(generateButton, copyButton, fillButton);
    dialog.appendMultiple(titleBar, passwordRow, nextFillRow, buttonsRow);
    wrapper.append(dialog);

    const icon = $('.tp-pwgen-icon');
    dialog.style.top = String(icon.offsetTop + icon.offsetHeight) + 'px';
    dialog.style.left = icon.style.left;

    document.body.append(wrapper);

    tpPassword.dialog = dialog;
    tpPassword.titleBar = titleBar;
    tpPassword.titleBar.addEventListener('mousedown', function(e) {
        tpPassword.mouseDown(e);
    });

    tpPassword.generate();
};

tpPassword.mouseDown = function(e) {
    tpPassword.selected = tpPassword.titleBar;
    tpPassword.startPosX = e.clientX;
    tpPassword.startPosY = e.clientY;
    tpPassword.diffX = tpPassword.startPosX - tpPassword.dialog.offsetLeft;
    tpPassword.diffY = tpPassword.startPosY - tpPassword.dialog.offsetTop;
    return false;
};

tpPassword.openDialog = function() {
    if (tpPassword.dialog.style.display === '' || tpPassword.dialog.style.display === 'none') {
        tpPassword.dialog.style.display = 'block';
    } else {
        tpPassword.dialog.style.display = 'none';
    }
};

tpPassword.trigger = function() {
    tpPassword.showDialog(tpPassword.inputField, tpPassword.icon);
};

tpPassword.showDialog = function(field, icon) {
    if (!tpFields.isVisible(field)) {
        document.body.removeChild(icon);
        field.removeAttribute('tp-password-generator');
        return;
    }

    tpPassword.createDialog();
    tpPassword.openDialog();

    // Adjust the dialog location
    if (tpPassword.dialog) {
        tpPassword.dialog.style.top = String(icon.offsetTop + icon.offsetHeight) + 'px';
        tpPassword.dialog.style.left = icon.style.left;

        tpPassword.dialog.setAttribute('tp-pwgen-field-id', field.getAttribute('data-tp-id'));
        tpPassword.dialog.setAttribute('tp-pwgen-next-field-id', field.getAttribute('tp-pwgen-next-field-id'));
        tpPassword.dialog.setAttribute('tp-pwgen-next-is-password-field', field.getAttribute('tp-pwgen-next-is-password-field'));

        const fieldExists = Boolean(field.getAttribute('tp-pwgen-next-field-exists'));
        const checkbox = $('.tp-pwgen-checkbox');
        if (checkbox) {
            checkbox.setAttribute('checked', fieldExists);
            if (fieldExists) {
                checkbox.removeAttribute('disabled');
            } else {
                checkbox.setAttribute('disabled', '');
            }
        }
    }
};

tpPassword.generate = function(e) {
    if (e) {
        e.preventDefault();
    }

    browser.runtime.sendMessage({
        action: 'generate_password'
    }).then(tpPassword.callbackGeneratedPassword).catch((err) => {
        console.log(err);
    });
};

tpPassword.copy = function(e) {
    e.preventDefault();
    if (tpPassword.copyPasswordToClipboard()) {
        tpPassword.greenButton('#tp-pwgen-btn-copy');
        tpPassword.whiteButton('#tp-pwgen-btn-fill');
    }
};

tpPassword.fill = function(e) {
    e.preventDefault();

    // Use the active input field
    const field = _f(tpPassword.dialog.getAttribute('tp-pwgen-field-id'));
    if (field) {
        const password = $('.tp-pwgen-input');
        if (field.getAttribute('maxlength')) {
            if (password.value.length > field.getAttribute('maxlength')) {
                const message = tr('passwordGeneratorErrorTooLong') + '\r\n' +
                    tr('passwordGeneratorErrorTooLongCut') + '\r\n' + tr('passwordGeneratorErrorTooLongRemember');
                message.style.whiteSpace = 'pre';
                browser.runtime.sendMessage({
                    action: 'show_notification',
                    args: [ message ]
                });
                return;
            }
        }

        field.value = password.value;
        if ($('.tp-pwgen-checkbox').checked) {
            if (field.getAttribute('tp-pwgen-next-field-id')) {
                const nextFieldId = field.getAttribute('tp-pwgen-next-field-id');
                const nextField = $('input[data-tp-id=\'' + nextFieldId + '\']');
                if (nextField) {
                    nextField.value = password.value;
                }
            }
        }

        if (tpPassword.copyPasswordToClipboard()) {
            tpPassword.greenButton('#tp-pwgen-btn-fill');
            tpPassword.whiteButton('#tp-pwgen-btn-copy');

            tpPassword.openDialog();
        }
    }
};

tpPassword.copyPasswordToClipboard = function() {
    $('.tp-pwgen-input').select();
    try {
        return document.execCommand('copy');
    } catch (err) {
        console.log('Could not copy password to clipboard: ' + err);
    }
    return false;
};

tpPassword.callbackGeneratedPassword = function(response) {
    if (response && response.success >= 1) {
        const errorMessage = $('#tp-pwgen-error');
        if (errorMessage) {
            tpPassword.enableButtons();

            $('.tp-pwgen-checkbox').parentElement.style.display = 'block';
            $('.tp-pwgen-bits').style.display = 'block';

            const input = $('.tp-pwgen-input');
            input.style.display = 'block';
            errorMessage.remove();
        }

        tpPassword.whiteButton('#tp-pwgen-btn-fill');
        tpPassword.whiteButton('#tp-pwgen-btn-copy');
        $('.tp-pwgen-input').value = response.data.password;
        $('.tp-pwgen-bits').textContent = (!response.data.entropy ? '???' : response.data.entropy) + tr('passwordGeneratorBits');
    } else {
        if (document.querySelectorAll('div#tp-pwgen-error').length === 0) {
            $('.tp-pwgen-checkbox').parentElement.style.display = 'none';
            $('.tp-pwgen-bits').style.display = 'none';

            const input = $('.tp-pwgen-input');
            input.style.display = 'none';

            const errorMessage = tpUI.createElement('div', '', { 'id': 'tp-pwgen-error' },
                tr('passwordGeneratorError') + '\r\n' + tr('passwordGeneratorErrorIsRunning'));
            errorMessage.style.whiteSpace = 'pre';
            input.parentElement.append(errorMessage);

            tpPassword.disableButtons();
        }
    }
};

tpPassword.onRequestPassword = function() {
    browser.runtime.sendMessage({
        action: 'generate_password'
    }).then(tpPassword.callbackGeneratedPassword);
};

tpPassword.greenButton = function(button) {
    $(button).classList.remove('tp-white-button');
    $(button).classList.add('tp-green-button');
};

tpPassword.whiteButton = function(button) {
    $(button).classList.remove('tp-green-button');
    $(button).classList.add('tp-white-button');
};

tpPassword.enableButtons = function() {
    $('#tp-pwgen-btn-generate').textContent = tr('passwordGeneratorGenerate');
    $('#tp-pwgen-btn-copy').style.display = 'inline-block';
    $('#tp-pwgen-btn-fill').style.display = 'inline-block';
};

tpPassword.disableButtons = function() {
    $('#tp-pwgen-btn-generate').textContent = tr('passwordGeneratorTryAgain');
    $('#tp-pwgen-btn-copy').style.display = 'none';
    $('#tp-pwgen-btn-fill').style.display = 'none';
};

// Handle icon position on window resize
window.addEventListener('resize', function(e) {
    if (tpPassword.inputField && tpPassword.icon) {
        tpPassword.setIconPosition(tpPassword.icon, tpPassword.inputField);
    }
});

// Handle icon position on scroll
window.addEventListener('scroll', function(e) {
    if (tpPassword.inputField && tpPassword.icon) {
        tpPassword.setIconPosition(tpPassword.icon, tpPassword.inputField);
    }
});

// Closes the dialog when clicked outside of it)
document.addEventListener('click', function(e) {
    if (tpPassword.dialog && tpPassword.dialog.style.display === 'block' && e.isTrusted) {
        const dialogEndX = tpPassword.dialog.offsetLeft + tpPassword.dialog.offsetWidth;
        const dialogEndY = tpPassword.dialog.offsetTop + tpPassword.dialog.offsetHeight;

        if (((e.clientX < tpPassword.dialog.offsetLeft || e.clientX > dialogEndX ||
            e.clientY < tpPassword.dialog.offsetTop || e.clientY > dialogEndY)) &&
            !e.target.classList.contains('tp-pwgen-icon')) {
            tpPassword.openDialog();
        }
    }
});
