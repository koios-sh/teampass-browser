'use strict';

function statusResponse(response) {

    $('#initial-state').hide();
    $('#error-encountered').hide();
    $('#need-reconfigure').hide();
    $('#not-configured').hide();
    $('#configured-and-associated').hide();
    $('#configured-not-associated').hide();
    $('#lock-database-button').hide();

    if (response && response['success']) {
        $('#user-info').show();
        $('reload-status-button').show();
        const userInfo = response['data'];
        $('#user-info-name')[0].textContent = userInfo['lastname'] + userInfo['name'];
        $('#user-info-role')[0].textContent = userInfo['roles'];
        $('#user-info-saltkey')[0].textContent = userInfo['saltkey'] ? "有效" : "无效";
        $('#user-info-personal-folder')[0].textContent = userInfo['personal_folder'] === '1' ? "开启" : "关闭";
    } else {
        $('reload-status-button').hide();
        $('#error-message').html(response && response['message'] || '未知错误');
        $('#error-encountered').show();
    }
}

function onPasswordLengthChange(ele) {
    $('.tp-pwgen-bits')[0].textContent = ele.target.value;
    generatePassword();
}

function generatePassword() {
    let length = parseInt($('.tp-pwgen-bits')[0].textContent || 20, 10);
    browser.runtime.sendMessage({
        action: 'generate_password',
        args: [length]
    }).then((response) => {
        if (response && response.success) {
            $('.tp-pwgen-input')[0].value = response.data.password;
            $('.tp-pwgen-bits')[0].textContent = (!response.data.entropy ? '???' : response.data.entropy);
        } else {
            $('.tp-pwgen-input')[0].value = response.message;
        }
    }).catch((err) => {
        console.log(err);
    });
}

$(function() {
    $('#tp-pwgen-btn-copy').click(function() {
        $('.tp-pwgen-input').select();
        try {
            return document.execCommand('copy');
        } catch (err) {
            alert('Could not copy password to clipboard: ' + err);
        }
    });

    $('#tp-pwgen-btn-generate').click(function() {
        generatePassword();
    });

    $('#tp-pwgen-length').on('input', onPasswordLengthChange);

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
        console.log(item);
        if (!item['whoami']['success']) {
            browser.runtime.sendMessage({
                action: 'get_user_info'
            }).then(statusResponse);
        } else {
            statusResponse(item['whoami']);
        }
    });

    generatePassword();
});
