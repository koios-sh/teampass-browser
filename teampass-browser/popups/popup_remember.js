'use strict';

const DEFAULT_BROWSER_GROUP = 'TeamPass-Browser Passwords';

var _tab;

function _initialize(tab) {
    _tab = tab;

    // No credentials set or credentials already cleared
    if (!_tab.credentials.username && !_tab.credentials.password) {
        _close();
        return;
    }

    // No existing credentials to update --> disable Update button
    if (_tab.credentials.list.length === 0) {
        $('#btn-update').attr('disabled', true).removeClass('btn-warning');
    }

    // No username available. This might be because of trigger from context menu --> disable New button
    if (!_tab.credentials.username && _tab.credentials.password) {
        $('#btn-new').attr('disabled', true).removeClass('btn-success');
    }

    let url = _tab.credentials.url;
    url = (url.length > 50) ? url.substring(0, 50) + '...' : url;
    $('.information-url:first').text(url);
    $('.information-username:first').text(_tab.credentials.username);

    if (!_tab.credentials.usernameExists) {
        $('#popupRememberInfoText').text('发现新用户名和密码，是否保存？');
        $('#information-label')[0].value = _tab.credentials.title;
        if (validateEmail(_tab.credentials.username)) {
            $('#information-email')[0].value = _tab.credentials.username;
        }   
    } else {
        const credential = _tab.credentials.existingCredential;
        $('#information-label')[0].value = credential.label;
        $('#information-email')[0].value = credential.email;
    }

    $('#information-label')[0].select();

    $('#btn-new').click(function(e) {
        e.preventDefault();
        $('.credentials').hide();
        $('ul#list').empty();

        const label = document.getElementById('information-label').value;
        if (!label || label.length === 0) {
            showNotification("名称不可为空");
            return;
        }

        // Get group listing from TeamPass
        browser.runtime.sendMessage({
            action: 'get_user_folders'
        }).then((groups) => {
            const addChildren = function(group, parentElement, depth) {
                ++depth;
                const padding = depth * 20;

                for (let i = 0; i < group.children.length; i ++) {
                    const child = group.children[i];
                    const a = createLink(child.title, child.id, child.children.length > 0);
                    a.attr('id', 'child');
                    a.css('cssText', 'padding-left: ' + String(padding) + 'px !important;');

                    if (parentElement.attr('id') === 'root') {
                        a.attr('id', 'root-child');
                    }

                    $('ul#list').append(a);
                    addChildren(child, a, depth);
                }
            };

            const createLink = function (folder_name, folder_id, hasChildren) {
                const a = $('<a>')
                    .attr('href', '#')
                    .attr('class', 'list-group-item')
                    .text(folder_name)
                    .click(function(ev) {
                        ev.preventDefault();
                        const label = document.getElementById('information-label').value;
                        const email = document.getElementById('information-email').value;
                        browser.runtime.sendMessage({
                            action: 'add_credentials',
                            args: [label, '', _tab.credentials.username, email, _tab.credentials.password, folder_id, _tab.credentials.url, '']
                        }).then(_verifyResult);
                    });

                if (hasChildren) {
                    a.text('\u25BE ' + folder_name);
                }
                return a;
            };

            // Create the link list for group selection
            let depth = 0;
            for (let i = 0; i < groups.length; i ++) {
                const g = groups[i];
                const a = createLink(g.title, g.id, g.children.length !== 0);
                a.attr('id', 'root');

                $('ul#list').append(a);
                addChildren(g, a, depth);
            }

            $('.groups').show();
        });
    });

    $('#btn-update').click(function(e) {
        e.preventDefault();
        $('.groups').hide();
        $('ul#list').empty();

        const label = document.getElementById('information-label').value;
        if (!label || label.length === 0) {
            showNotification("名称不可为空");
            return;
        }

        //  Only one entry which could be updated
        {
            $('.credentials:first .username-new:first strong:first').text(_tab.credentials.username);
            $('.credentials:first .username-exists:first strong:first').text(_tab.credentials.username);

            if (_tab.credentials.usernameExists) {
                $('.credentials:first .username-new:first').hide();
                $('.credentials:first .username-exists:first').show();
            } else {
                $('.credentials:first .username-new:first').show();
                $('.credentials:first .username-exists:first').hide();
            }

            for (let i = 0; i < _tab.credentials.list.length; i++) {
                const $a = $('<a>')
                    .attr('href', '#')
                    .attr('class', 'list-group-item')
                    .text(_tab.credentials.list[i].label + ' (' + _tab.credentials.list[i].login + ')')
                    .data('credential', _tab.credentials.list[i])
                    .click(function(ev) {
                        ev.preventDefault();
                        const credential = $(this).data('credential');

                        // Use the current username if it's empty
                        if (!_tab.credentials.username) {
                            _tab.credentials.username = _tab.credentials.list[id].login;
                        }

                        const label = document.getElementById('information-label').value;
                        const email = document.getElementById('information-email').value;

                        browser.runtime.sendMessage({
                            action: 'update_credentials',
                            args: [credential.id, label, credential.desc, _tab.credentials.username, email, _tab.credentials.password, credential.folder_id, _tab.credentials.url, credential.tags]
                        }).then(_verifyResult);
                    });

                if (_tab.credentials.existingCredential && _tab.credentials.existingCredential.id === _tab.credentials.list[i].id) {
                    $a.css('font-weight', 'bold');
                }

                $('ul#list').append($a);
            }

            $('.credentials').show();
        }
    });

    $('#btn-dismiss').click(function(e) {
        e.preventDefault();
        _close();
    });

    $('#btn-ignore').click(function(e) {
        browser.windows.getCurrent().then((win) => {
            browser.tabs.query({ 'active': true, 'currentWindow': true }).then((tabs) => {
                const currentTab = tabs[0];
                browser.runtime.getBackgroundPage().then((global) => {
                    browser.tabs.sendMessage(currentTab.id, {
                        action: 'ignore_site',
                        args: [ _tab.credentials.url ]
                    });
                    _close();
                });
            });
        });
    });
}

function _verifyResult(response) {
    if (!response.success) {
        showNotification(response.message);
    } else {
        showNotification('密码保存成功，ID: ' + response.data.item_id);
        _close();
    }
}

function _close() {
    browser.runtime.sendMessage({
        action: 'remove_credentials_from_tab_information'
    });

    browser.runtime.sendMessage({
        action: 'pop_stack'
    });

    window.parent.postMessage({"type":"removePopupRememberIframe"}, "*");

    close();
}
$(function() {
    browser.runtime.sendMessage({
        action: 'stack_add',
        args: [ 'icon_remember_red_background.png', 'popup_remember.html', 10, true, 0 ]
    });

    browser.runtime.sendMessage({
        action: 'get_tab_information'
    }).then(_initialize);
});
