'use strict';

var tpAutocomplete = {};
tpAutocomplete.autoSubmit = false;
tpAutocomplete.elements = [];
tpAutocomplete.started = false;
tpAutocomplete.index = -1;
tpAutocomplete.icons = {};
tpAutocomplete.input = undefined;
tpAutocomplete.filter = undefined;


try {
    tpAutocomplete.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const targetId = entry.target.getAttribute('data-tp-id');
            if (!(targetId in tpAutocomplete.icons)) {
                continue;
            }
            const icon = tpAutocomplete.icons[targetId];
            const rect = DOMRectToArray(entry.boundingClientRect);

            if ((entry.intersectionRatio === 0 && !entry.isIntersecting) || (rect.some(x => x < -10))) {
                icon.style.display = 'none';
            } else if (entry.intersectionRatio > 0 && entry.isIntersecting) {
                icon.style.display = 'block';

                // Wait for possible DOM animations
                setTimeout(() => {
                    tpAutocomplete.setIconPosition(icon);
                }, 500);
            }
        }
    });
} catch (err) {
    console.log(err);
}

tpAutocomplete.create = function(input, showListInstantly = false, autoSubmit = false) {
    tpAutocomplete.autoSubmit = autoSubmit;
    tpAutocomplete.input = input;
    tpAutocomplete.started = true;

    if (input.getAttribute('tp-password-complete') || input.getAttribute('tp-password-generator')) {
        return;
    }

    // Observer the visibility
    if (tpAutocomplete.observer) {
        tpAutocomplete.observer.observe(input);
    }

    input.setAttribute('tp-password-complete', true);

    tpAutocomplete.createIcon(input);

    // input.addEventListener('click', function(e) {
    //     if (!e.isTrusted) {
    //         return;
    //     }

    //     if (input.value !== '') {
    //         input.select();
    //     }
    //     tpAutocomplete.showList(input);
    // });

    input.addEventListener('keydown', tpAutocomplete.keyPress);
    input.setAttribute('autocomplete', 'off');

    // if (showListInstantly) {
    //     tpAutocomplete.showList(input);
    // }
};

tpAutocomplete.createIcon = function (field) {
    const targetId = field.getAttribute('data-tp-id');
    const className = (isFirefox() ? 'key-moz' : 'key');
    const size = (field.offsetHeight > 28) ? 24 : 16;
    let offset = Math.floor((field.offsetHeight - size) / 3);
    offset = (offset < 0) ? 0 : offset;

    const icon = tpUI.createElement('div', 'tp tp-fill-icon ' + className,
        {
            'title': tr('contextMenuFillUsernameAndPassword'),
            'size': size,
            'offset': offset,
            'tp-uname-field-id': targetId
        });
    icon.style.zIndex = '99999';
    icon.style.width = String(size) + 'px';
    icon.style.height = String(size) + 'px';

    icon.addEventListener('click', function (e) {
        e.preventDefault();
      
        if (field.value !== '') {
            field.select();
        }
        tpAutocomplete.showList(field);
    });

    tpAutocomplete.icons[targetId] = icon;
    tpAutocomplete.setIconPosition(icon);
    document.body.appendChild(icon);
};

tpAutocomplete.setIconPosition = function (icon) {
    const targetId = icon && icon.getAttribute('tp-uname-field-id') || "";
    if (!(targetId in tpAutocomplete.icons)) {
        return;
    }
    const field = _f(targetId);
    if (!field) {
        return;
    }
    const rect = field.getBoundingClientRect();
    const offset = Number(icon.getAttribute('offset'));
    const size = Number(icon.getAttribute('size'));

    icon.style.top = String((rect.top + document.scrollingElement.scrollTop) + offset + 1) + 'px';
    icon.style.left = String((rect.left + document.scrollingElement.scrollLeft) + field.offsetWidth - size - offset) + 'px';
};

// Handle icon position on window resize
window.addEventListener('resize', function (e) {
    for (var targetId in tpAutocomplete.icons) {
        tpAutocomplete.setIconPosition(tpAutocomplete.icons[targetId]);
    }
});

// Handle icon position on scroll
window.addEventListener('scroll', function (e) {
    for (var targetId in tpAutocomplete.icons) {
        tpAutocomplete.setIconPosition(tpAutocomplete.icons[targetId]);
    }
});

tpAutocomplete.showList = function(inputField) {
    tpAutocomplete.closeList();
    tpAutocomplete.input = inputField;
    const div = tpUI.createElement('div', 'tpAutocomplete-items', { 'id': 'tpAutocomplete-list', 'style': 'background-color: #0677e1' });

    // Element position
    const rect = inputField.getBoundingClientRect();
    div.style.top = String((rect.top + document.body.scrollTop) + inputField.offsetHeight) + 'px';
    div.style.left = String((rect.left + document.body.scrollLeft)) + 'px';
    div.style.minWidth = String(inputField.offsetWidth) + 'px';
    div.style.zIndex = '2147483646';
    document.body.append(div);

    const searchDiv = document.createElement('div');
    searchDiv.textContent = '当前域名共找到 ' + tpAutocomplete.elements.length + ' 个密码';
    div.append(searchDiv);
    if (tpAutocomplete.elements.length > 0) {
        const searchInput = tpUI.createElement('input', 'login-filter', { 'type': 'search', 'value': '', 'id': 'login-filter', 'style': 'width: 100%', 'placeholder': '键入筛选密码' });
        searchDiv.append(searchInput);

        tpAutocomplete.filter = searchInput;

        const loginDiv = tpUI.createElement('div', 'list-group', { 'id': 'list-list' });

        for (const c of tpAutocomplete.elements) {
            const item = document.createElement('div');
            item.textContent += c.label;
            const itemInput = tpUI.createElement('input', '', { 'type': 'hidden', 'value': c.value });
            item.append(itemInput);
            item.addEventListener('click', function (e) {
                if (!e.isTrusted) {
                    return;
                }

                // Save index for combination.loginId
                const index = Array.prototype.indexOf.call(e.currentTarget.parentElement.childNodes, e.currentTarget);
                inputField.value = this.getElementsByTagName('input')[0].value;
                tpAutocomplete.fillPassword(inputField.value, index);
                tpAutocomplete.closeList();
                inputField.focus();
            });

            // These events prevent the double hover effect if both keyboard and mouse are used
            item.addEventListener('mouseover', function (e) {
                tpAutocomplete.removeItem(tpAutocomplete.getAllItems());
                item.classList.add('tpAutocomplete-active');
                tpAutocomplete.index = Array.from(loginDiv.childNodes).indexOf(item);
            });
            item.addEventListener('mouseout', function (e) {
                item.classList.remove('tpAutocomplete-active');
            });

            loginDiv.appendChild(item);
        }

        searchInput.addEventListener('keyup', (e) => {
            const val = searchInput.value;
            const re = new RegExp(val, 'i');
            const divs = loginDiv.getElementsByTagName('div');
            for (const i in divs) {
                if (divs.hasOwnProperty(i)) {
                    const found = String(divs[i].textContent).match(re) !== null;
                    divs[i].style = found ? '' : 'display: none;';
                }
            }
        });

        div.append(loginDiv);
    }    

    // Add a footer message for auto-submit
    if (tpAutocomplete.autoSubmit) {
        const footer = tpUI.createElement('footer', '', {}, tr('autocompleteSubmitMessage'));
        div.appendChild(footer);
    }

    // Activate the first item automatically
    // const items = tpAutocomplete.getAllItems();
    // tpAutocomplete.index = 2;
    // tpAutocomplete.activateItem(items);
};

tpAutocomplete.activateItem = function(item) {
    if (!item || item.length === 0) {
        return;
    }

    tpAutocomplete.removeItem(item);
    if (tpAutocomplete.index >= item.length) {
        tpAutocomplete.index = 0;
    }

    if (tpAutocomplete.index < 0) {
        tpAutocomplete.index = item.length - 1;
    }

    if (item[tpAutocomplete.index] !== undefined) {
        item[tpAutocomplete.index].classList.add('tpAutocomplete-active');
    }
};

tpAutocomplete.removeItem = function(items) {
    for (const item of items) {
        item.classList.remove('tpAutocomplete-active');
    }
};

tpAutocomplete.closeList = function(elem) {
    
    const items = document.getElementsByClassName('tpAutocomplete-items');
    for (const item of items) {
        if (elem !== item && tpAutocomplete.input) {
            item.parentNode.removeChild(item);
        }
    }
    if (!tpFields.isVisible(tpAutocomplete.input)) {
        const targetId = tpAutocomplete.input.getAttribute('data-tp-id');
        if (!(targetId in tpAutocomplete.icons)) {
            return;
        }
        const icon = tpAutocomplete.icons[targetId];
        document.body.removeChild(icon);
        tpAutocomplete.input.removeAttribute('tp-password-generator');
    }
};

tpAutocomplete.getAllItems = function() {
    const list = document.getElementById('tpAutocomplete-list');
    if (!list) {
        return [];
    }
    return list.getElementsByTagName('div');
};

/**
 * Keyboard shortcuts for autocomplete menu:
 * - ArrowDown shows the list or selects item below, or the first item (last is active)
 * - ArrowUp selects item above, or the last item (first is active)
 * - Enter or Tab selects the item
 * - Backspace and Delete shows the list if input field is empty. First item is activated
*/
tpAutocomplete.keyPress = function(e) {
    if (!e.isTrusted) {
        return;
    }

    const items = tpAutocomplete.getAllItems();
    if (e.key === 'ArrowDown') {
        // If the list is not visible, show it
        if (items.length === 0) {
            tpAutocomplete.index = -1;
            tpAutocomplete.showList(tpAutocomplete.input);
        } else {
            // Activate next item
            ++tpAutocomplete.index;
            tpAutocomplete.activateItem(items);
        }
    } else if (e.key === 'ArrowUp') {
        --tpAutocomplete.index;
        tpAutocomplete.activateItem(items);
    } else if (e.key === 'Enter') {
        if (tpAutocomplete.input.value === '') {
            e.preventDefault();
        }

        if (tpAutocomplete.index >= 0 && items && items[tpAutocomplete.index] !== undefined) {
            e.preventDefault();
            tpAutocomplete.input.value = e.currentTarget.value;
            tpAutocomplete.fillPassword(tpAutocomplete.input.value, tpAutocomplete.index);
            tpAutocomplete.closeList();
        }
    } else if (e.key === 'Tab') {
        // Return if value is not in the list
        if (tpAutocomplete.input.value !== '' && !tpAutocomplete.elements.some(c => c.value === tpAutocomplete.input.value)) {
            tpAutocomplete.closeList();
            return;
        }

        tpAutocomplete.index = tpAutocomplete.elements.findIndex(c => c.value === tpAutocomplete.input.value);
        tpAutocomplete.fillPassword(tpAutocomplete.input.value, tpAutocomplete.index);
        tpAutocomplete.closeList();
    } else if (e.key === 'Escape') {
        tpAutocomplete.closeList();
    } else if ((e.key === 'Backspace' || e.key === 'Delete') && tpAutocomplete.input.value === '') {
        // Show menu when input field has no value and backspace is pressed
        tpAutocomplete.index = -1;
        tpAutocomplete.showList(tpAutocomplete.input);
    }
};

tpAutocomplete.fillPassword = function(value, index) {
    const fieldId = tpAutocomplete.input.getAttribute('data-tp-id');
    tpFields.prepareId(fieldId);
    const givenType = tpAutocomplete.input.type === 'password' ? 'password' : 'username';
    const combination = tpFields.getCombination(givenType, fieldId);
    combination.loginId = index;

    tp.fillIn(combination, givenType === 'password', false);
    // tp.fillInCredentials(combination, givenType === 'password', false);
    tpAutocomplete.input.setAttribute('fetched', true);
};

// Detect click outside autocomplete
document.addEventListener('click', function(e) {
    if (!e.isTrusted) {
        return;
    }

    const list = document.getElementById('tpAutocomplete-list');
    if (!list) {
        return;
    }

    if (!((e.target === tpAutocomplete.input && e.target.nodeName === tpAutocomplete.input.nodeName) || 
        (e.target === tpAutocomplete.filter && e.target.nodeName === tpAutocomplete.filter.nodeName) ||
        e.target.classList.contains('tp-fill-icon'))) {
        tpAutocomplete.closeList(e.target);
    }
});
