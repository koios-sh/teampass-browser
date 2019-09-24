'use strict';

function statusResponse(response) {

    $('#initial-state').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();

    if (response['success']) {
        $('#user-info').show();
        const userInfo = response['data'];
        $('#user-info-name')[0].textContent = userInfo['lastname'] + userInfo['name'];
        $('#user-info-role')[0].textContent = userInfo['roles'];
        $('#user-info-saltkey')[0].textContent = userInfo['saltkey'] ? "有效" : "无效";
        $('#user-info-personal-folder')[0].textContent = userInfo['personal_folder'] === '1' ? "开启" : "关闭";
    } else {
        $('#error-message').html(response['message']);
        $('#error-encountered').show();
    }
}

$(function() {
    // $('#connect-button').click(function() {
    //     browser.runtime.sendMessage({
    //         action: 'associate'
    //     });
    //     close();
    // });

    // $('#reconnect-button').click(function() {
    //     browser.runtime.sendMessage({
    //         action: 'associate'
    //     });
    //     close();
    // });

    $('#reload-status-button').click(function() {
        $('#user-info').hide();
        $('#error-message').hide();
        $('#initial-state').show();
        browser.runtime.sendMessage({
            action: 'get_user_info'
        }).then(statusResponse);
    });

    $('#redetect-fields-button').click(function() {
        browser.tabs.query({ 'active': true, 'currentWindow': true }).then(function(tabs) {
            if (tabs.length === 0) {
                return; // For example: only the background devtools or a popup are opened
            }
            const tab = tabs[0];

            browser.tabs.sendMessage(tab.id, {
                action: 'redetect_fields'
            });
        });
    });

    browser.storage.local.get({ 'whoami': {} }).then(item => {
        if (!item.whoami.success) {
            browser.runtime.sendMessage({
                action: 'get_user_info'
            }).then(statusResponse);
        } else {
            statusResponse(item.whoami);
        }
    });
});
