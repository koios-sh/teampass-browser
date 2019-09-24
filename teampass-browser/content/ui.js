'use strict';

// jQuery style wrapper for querySelector()
var $ = function(elem) {
    return document.querySelector(elem);
};

var tpUI = {};

// Wrapper for creating elements
tpUI.createElement = function(type, classes, attributes, textContent) {
    const element = document.createElement(type);

    if (classes) {
        const splitted = classes.split(' ');
        for (const c of splitted) {
            element.classList.add(c);
        }
    }

    if (attributes !== undefined) {
        Object.keys(attributes).forEach((key) => {
            element.setAttribute(key, attributes[key]);
        });
    }

    if (textContent !== undefined) {
        element.textContent = textContent;
    }

    return element;
};

// Enables dragging
document.addEventListener('mousemove', function(e) {
    if (tpPassword.selected === tpPassword.titleBar) {
        const xPos = e.clientX - tpPassword.diffX;
        const yPos = e.clientY - tpPassword.diffY;

        if (tpPassword.selected !== null) {
            tpPassword.dialog.style.left = xPos + 'px';
            tpPassword.dialog.style.top = yPos + 'px';
        }
    }

    if (tpDefine.selected === tpDefine.dialog) {
        const xPos = e.clientX - tpDefine.diffX;
        const yPos = e.clientY - tpDefine.diffY;

        if (tpDefine.selected !== null) {
            tpDefine.dialog.style.left = xPos + 'px';
            tpDefine.dialog.style.top = yPos + 'px';
        }
    }
});

document.addEventListener('mouseup', function() {
    tpPassword.selected = null;
    tpDefine.selected = null;
});

HTMLDivElement.prototype.appendMultiple = function(...args) {
    for (const a of args) {
        this.append(a);
    }
};
